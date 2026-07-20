window.API = (() => {
  const NS = 'cm1_';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* cache localStorage con TTL (0 = permanente) */
  const cache = {
    get(key) {
      try {
        const raw = localStorage.getItem(NS + key);
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (o.exp && o.exp < Date.now()) { localStorage.removeItem(NS + key); return null; }
        return o.v;
      } catch { return null; }
    },
    set(key, val, ttl) {
      try { localStorage.setItem(NS + key, JSON.stringify({ v: val, exp: ttl ? Date.now() + ttl : 0 })); }
      catch { try { localStorage.clear(); } catch {} }
    }
  };

  /* fetch con retry + backoff esponenziale (gestisce 429) */
  async function fetchJSON(url, signal, retries = 3) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const res = await fetch(url, { signal });
        if (res.status === 429) throw new Error('rate-limit');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (err.name === 'AbortError') throw err;
        if (i < retries) await sleep(500 * Math.pow(2, i) + Math.random() * 400);
      }
    }
    throw lastErr;
  }

  const forecastURL = () => 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: CONFIG.lat, longitude: CONFIG.lon, timezone: CONFIG.tz, forecast_days: 7,
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean',
    hourly: 'temperature_2m,precipitation,relative_humidity_2m,weathercode'
  });

  const archiveURL = y => 'https://archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({
    latitude: CONFIG.lat, longitude: CONFIG.lon, timezone: CONFIG.tz,
    start_date: `${y}-01-01`, end_date: `${y}-12-31`,
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean'
  });

  const nowYear = () => +new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.tz, year: 'numeric' }).format(new Date());
  const nowIso = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: CONFIG.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date()).replace(' ', 'T');

  async function getForecast(force = false, signal) {
    if (!force) { const hit = cache.get('forecast'); if (hit) return { data: hit, cached: true }; }
    const data = await fetchJSON(forecastURL(), signal);
    cache.set('forecast', data, CONFIG.forecastTtl);
    return { data, cached: false };
  }

  async function getYear(year, force = false, signal) {
    const key = 'y' + year;
    if (!force) { const hit = cache.get(key); if (hit) return { year, data: hit, cached: true }; }
    const json = await fetchJSON(archiveURL(year), signal);
    const d = json.daily || {};
    const payload = {                       // memorizzo solo i campi necessari (cache più leggera)
      time: d.time || [], tmax: d.temperature_2m_max || [], tmin: d.temperature_2m_min || [],
      tmean: d.temperature_2m_mean || [], rain: d.precipitation_sum || [], hum: d.relative_humidity_2m_mean || []
    };
    cache.set(key, payload, year >= nowYear() ? CONFIG.volatileYearTtl : 0); // anni passati: immutabili → cache permanente
    return { year, data: payload, cached: false };
  }

  /* pool a concorrenza limitata: mai più di N richieste aperte */
  async function loadYears(years, { force = false, signal, onProgress } = {}) {
    const out = new Map();
    let done = 0, cursor = 0;
    const n = Math.min(CONFIG.concurrency, years.length);
    const workers = Array.from({ length: n }, async () => {
      while (cursor < years.length) {
        const y = years[cursor++];
        try {
          const r = await getYear(y, force && y >= nowYear(), signal);
          out.set(y, r.data);
        } catch (err) {
          if (err.name === 'AbortError') throw err;
          out.set(y, null);
        }
        onProgress && onProgress(++done, years.length, y, out);
      }
    });
    await Promise.all(workers);
    return out;
  }

  return { getForecast, getYear, loadYears, nowYear, nowIso };
})();