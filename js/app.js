(() => {
  const $  = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const CY = API.nowYear();

  const state = {
    month: +new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.tz, month: 'numeric' }).format(new Date()) - 1,
    yearFrom: CONFIG.archiveStart,
    yearTo: CY,
    years: new Map(),
    forecast: null,
    fcHourly: null,
    metrics: { forecast: 'temp', daily: 'temp', profile: 'temp', annual: 'temp', monthyears: 'temp' },
    loading: false,
    controller: null
  };

  /* ── helper ── */
  const mean = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, b) => s + b, 0) / v.length : null; };
  const sum  = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, b) => s + b, 0) : null; };
  const max  = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? Math.max(...v) : null; };
  const min  = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? Math.min(...v) : null; };
  const r1   = v => v == null ? null : Math.round(v * 10) / 10;
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; };
  const dow  = ds => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
  const monthRows = (d, m) => { const out = []; d.time.forEach((t, i) => { if (+t.slice(5, 7) - 1 === m) out.push(i); }); return out; };
  function throttle(fn, wait) {
    let last = 0, timer = null, args;
    return (...a) => {
      args = a;
      const now = Date.now();
      const run = () => { last = now; fn(...args); };
      if (now - last >= wait) run();
      else { clearTimeout(timer); timer = setTimeout(run, wait - (now - last)); }
    };
  }

  const WMO = {
    0:['☀️','Sereno'],1:['🌤️','Prevalentemente sereno'],2:['⛅','Parzialmente nuvoloso'],3:['☁️','Coperto'],
    45:['🌫️','Nebbia'],48:['🌫️','Nebbia gelata'],
    51:['🌦️','Pioviggine debole'],53:['🌦️','Pioviggine'],55:['🌧️','Pioviggine intensa'],
    61:['🌧️','Pioggia debole'],63:['🌧️','Pioggia moderata'],65:['🌧️','Pioggia intensa'],
    66:['🌧️','Pioggia gelata'],67:['🌧️','Pioggia gelata intensa'],
    71:['🌨️','Neve debole'],73:['🌨️','Neve moderata'],75:['❄️','Neve intensa'],77:['❄️','Nevischio'],
    80:['🌦️','Rovesci deboli'],81:['🌧️','Rovesci'],82:['⛈️','Rovesci violenti'],
    85:['🌨️','Rovesci di neve'],86:['❄️','Rovesci di neve intensi'],
    95:['⛈️','Temporale'],96:['⛈️','Temporale con grandine'],99:['⛈️','Violento temporale con grandine']
  };
  const wmo = code => WMO[code] || ['🌡️', '—'];

  /* ── orologio & countdown ── */
  const timeFmt = new Intl.DateTimeFormat('it-IT', { timeZone: CONFIG.tz, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat('it-IT', { timeZone: CONFIG.tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function tickClock() { const now = new Date(); $('#clock').textContent = timeFmt.format(now); $('#today').textContent = dateFmt.format(now); }

  let nextRefresh = Date.now() + CONFIG.autoRefreshMs;
  const CIRC = 2 * Math.PI * 15;
  function tickCountdown() {
    const left = Math.max(0, nextRefresh - Date.now());
    $('#countdown').textContent =
      String(Math.floor(left / 60000)).padStart(2, '0') + ':' + String(Math.floor(left % 60000 / 1000)).padStart(2, '0');
    $('#ringFg').style.strokeDashoffset = CIRC * (1 - left / CONFIG.autoRefreshMs);
  }

  /* ── stato barra ── */
  function setStatus(msg, kind = 'ok') { const el = $('#statusMsg'); el.textContent = msg; el.dataset.kind = kind; }
  function setProgress(done, total, msg) {
    $('#progressFill').style.setProperty('--p', (total ? done / total * 100 : 0).toFixed(1) + '%');
    if (msg) setStatus(msg, done >= total ? 'ok' : 'load');
  }

  /* ── sparkline 24h (canvas nativo, zero dipendenze) ── */
  let sparkCache = null;
  function drawSpark(canvas, values, color) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 64;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const vals = values.map((v, i) => v == null ? null : [i, v]).filter(Boolean);
    if (vals.length < 2) return;
    const lo = Math.min(...vals.map(p => p[1])) - .5, hi = Math.max(...vals.map(p => p[1])) + .5;
    const X = i => 2 + (i / (values.length - 1)) * (w - 4);
    const Y = v => h - 6 - ((v - lo) / (hi - lo)) * (h - 12);
    const path = () => { c.beginPath(); vals.forEach(([i, v], k) => k ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))); };
    path();
    c.lineTo(X(vals[vals.length - 1][0]), h); c.lineTo(X(vals[0][0]), h); c.closePath();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hexA(color, .35)); g.addColorStop(1, hexA(color, 0));
    c.fillStyle = g; c.fill();
    path();
    c.strokeStyle = color; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    const [li, lv] = vals[vals.length - 1];
    c.beginPath(); c.arc(X(li), Y(lv), 3.5, 0, Math.PI * 2); c.fillStyle = color; c.fill();
  }

  /* ── previsioni ── */
  async function loadForecast(force = false) {
    try {
      const { data, cached } = await API.getForecast(force, state.controller?.signal);
      state.forecast = data;
      renderNow(data);
      renderDayCards(data);
      buildFcHourly(data);
      renderSection('forecast');
      $('#subForecast').textContent = `sincronizzato alle ${timeFmt.format(new Date())} · dati orari`;
      if (cached) setStatus('Previsioni servite dalla cache', 'ok');
    } catch (err) {
      if (err.name !== 'AbortError') setStatus('⚠ Errore previsioni: ' + err.message, 'err');
    }
  }

  function buildFcHourly(data) {
    const h = data.hourly;
    state.fcHourly = {
      labels: h.time.map(t => t.slice(11, 16) === '00:00'
        ? `${CONFIG.daysShort[dow(t.slice(0, 10))]} ${t.slice(11, 16)}` : t.slice(11, 16)),
      temp: h.temperature_2m, rain: h.precipitation, hum: h.relative_humidity_2m
    };
  }

  function renderNow(data) {
    if (!data?.hourly) return;
    const h = data.hourly, d = data.daily;
    const nowIso = API.nowIso();
    let i = 0;
    for (let k = 0; k < h.time.length; k++) if (h.time[k] <= nowIso) i = k;
    const [icon, desc] = wmo(h.weathercode[i]);
    $('#nowIcon').textContent = icon;
    $('#nowTemp').innerHTML = `${Math.round(h.temperature_2m[i])}<span class="deg">°C</span>`;
    $('#nowDesc').textContent = desc;
    $('#nowMeta').textContent = `oggi: ${r1(d.temperature_2m_max[0])}° max · ${r1(d.temperature_2m_min[0])}° min`;
    $('#stMax').textContent  = r1(d.temperature_2m_max[0]) + ' °C';
    $('#stMin').textContent  = r1(d.temperature_2m_min[0]) + ' °C';
    $('#stRain').textContent = r1(d.precipitation_sum[0]) + ' mm';
    $('#stHum').textContent  = Math.round(h.relative_humidity_2m[i] ?? 0) + ' %';
    $('#stProb').textContent = (d.precipitation_probability_max?.[0] ?? '—') + ' %';
    sparkCache = { v: h.temperature_2m.slice(i, i + 24), c: CONFIG.colors.temp };
    drawSpark($('#spark'), sparkCache.v, sparkCache.c);
    $('#sparkLabel').textContent = `prossime 24 h · da ${h.time[i].slice(11, 16)}`;
  }

  function renderDayCards(data) {
    const d = data.daily;
    const vals = d.temperature_2m_min.filter(v => v != null);
    const lo = Math.min(...vals), hi = Math.max(...d.temperature_2m_max.filter(v => v != null));
    const span = (hi - lo) || 1;
    $('#dayCards').innerHTML = d.time.map((t, i) => {
      const [icon, desc] = wmo(d.weathercode[i]);
      const name = i === 0 ? 'OGGI' : CONFIG.daysShort[dow(t)];
      const date = `${t.slice(8, 10)} ${CONFIG.monthsShort[+t.slice(5, 7) - 1]}`;
      const prob = d.precipitation_probability_max?.[i];
      const tmax = d.temperature_2m_max[i], tmin = d.temperature_2m_min[i];
      return `
      <article class="day-card ${i === 0 ? 'day-card--today' : ''}" style="--i:${i}" title="${desc}">
        <header><span class="day-name">${name}</span><span class="day-date mono">${date}</span></header>
        <div class="day-icon">${icon}</div>
        <div class="day-temps"><b>${Math.round(tmax)}°</b><span>${Math.round(tmin)}°</span></div>
        <div class="temp-range"><i style="--w:${((tmax - tmin) / span * 100).toFixed(1)}%;--l:${((tmin - lo) / span * 100).toFixed(1)}%"></i></div>
        <footer class="mono">
          <span class="rain">💧 ${r1(d.precipitation_sum[i]) ?? 0} mm</span>
          <span>${Math.round(d.relative_humidity_2m_mean[i] ?? 0)}%</span>
        </footer>
        ${prob != null ? `<div class="prob"><i style="width:${prob}%"></i></div><span class="prob-label mono">prob. ${prob}%</span>` : ''}
      </article>`;
    }).join('');
  }

  /* ── serie storiche ── */
  async function loadHistory(force = false) {
    if (state.loading) return;
    state.loading = true;
    $('#btnRefresh').classList.add('is-loading');
    setProgress(0, 1, 'Avvio sincronizzazione serie storiche…');
    const years = [];
    for (let y = CONFIG.archiveStart; y <= CY; y++) years.push(y);
    const scheduleRender = throttle(() => renderHistoryCharts(), 450);
    try {
      const loaded = await API.loadYears(years, {
        force,
        signal: state.controller?.signal,
        onProgress: throttle((done, total, year, partial) => {
          partial.forEach((v, k) => { if (v) state.years.set(k, v); });
          setProgress(done, total, `Annata ${year} · ${done}/${total}`);
          scheduleRender();                       // i grafici si riempiono progressivamente
        }, 400)
      });
      loaded.forEach((v, k) => { if (v) state.years.set(k, v); });
      const failed = years.filter(y => !state.years.has(y));
      setProgress(1, 1, failed.length
        ? `⚠ ${failed.length} annate non caricate — premi Aggiorna tutto`
        : `✓ ${state.years.size} annate sincronizzate · cache attiva`);
    } catch (err) {
      if (err.name !== 'AbortError') setStatus('⚠ Errore serie storiche: ' + err.message, 'err');
    } finally {
      state.loading = false;
      $('#btnRefresh').classList.remove('is-loading');
      renderHistoryCharts();
    }
  }

  /* ── aggregati ── */
  const yearsInRange = () =>
    [...state.years.entries()]
      .filter(([y, v]) => v && y >= state.yearFrom && y <= state.yearTo)
      .sort((a, b) => a[0] - b[0]);

  function renderDaily(yrs) {
    if (!yrs.length || !window.Chart) return;
    const [year, d] = yrs.find(([y]) => y === state.yearTo) || yrs[yrs.length - 1];
    const rows = monthRows(d, state.month);
    if (!rows.length) return;
    Charts.renderDaily({
      labels: rows.map(i => d.time[i].slice(8, 10)),
      tmax: rows.map(i => d.tmax[i]), tmean: rows.map(i => d.tmean[i]), tmin: rows.map(i => d.tmin[i]),
      rain: rows.map(i => d.rain[i]), hum: rows.map(i => d.hum[i])
    }, state.metrics.daily);
    $('#dailyTitle').textContent = `${CONFIG.months[state.month]} ${year}`;
    $('#subDaily').textContent = `${rows.length} giorni · annata ${year}`;
  }

  function renderProfile(yrs) {
    if (!yrs.length || !window.Chart) return;
    const temp = Array.from({ length: 12 }, () => []);
    const rain = Array.from({ length: 12 }, () => []);
    const hum  = Array.from({ length: 12 }, () => []);
    for (const [, d] of yrs) {
      const acc = Array.from({ length: 12 }, () => ({ t: [], r: 0, rn: 0, h: [] }));
      d.time.forEach((t, i) => {
        const m = +t.slice(5, 7) - 1;
        if (d.tmean[i] != null) acc[m].t.push(d.tmean[i]);
        if (d.rain[i] != null) { acc[m].r += d.rain[i]; acc[m].rn++; }
        if (d.hum[i] != null) acc[m].h.push(d.hum[i]);
      });
      acc.forEach((a, m) => { temp[m].push(mean(a.t)); if (a.rn) rain[m].push(a.r); hum[m].push(mean(a.h)); });
    }
    Charts.renderProfile({
      labels: CONFIG.monthsShort,
      temp: temp.map(mean).map(r1), rain: rain.map(mean).map(r1),
      hum: hum.map(mean).map(v => v == null ? null : Math.round(v))
    }, state.metrics.profile);
  }

  function renderAnnual(yrs) {
    if (!yrs.length || !window.Chart) return;
    Charts.renderAnnual({
      labels: yrs.map(([y]) => String(y)),
      temp: yrs.map(([, d]) => r1(mean(d.tmean))),
      rain: yrs.map(([, d]) => r1(sum(d.rain))),
      hum:  yrs.map(([, d]) => { const v = mean(d.hum); return v == null ? null : Math.round(v); })
    }, state.metrics.annual);
  }

  function renderMonthYears(yrs) {
    if (!yrs.length || !window.Chart) return;
    const tmax = [], tmean = [], tmin = [], rain = [], hum = [];
    for (const [, d] of yrs) {
      const rows = monthRows(d, state.month);
      tmax.push(rows.length ? r1(max(rows.map(i => d.tmax[i]))) : null);
      tmean.push(rows.length ? r1(mean(rows.map(i => d.tmean[i]))) : null);
      tmin.push(rows.length ? r1(min(rows.map(i => d.tmin[i]))) : null);
      rain.push(rows.length ? r1(sum(rows.map(i => d.rain[i]))) : null);
      const h = rows.length ? mean(rows.map(i => d.hum[i])) : null;
      hum.push(h == null ? null : Math.round(h));
    }
    Charts.renderMonthYears({ labels: yrs.map(([y]) => String(y)), tmax, tmean, tmin, rain, hum }, state.metrics.monthyears);
  }

  function updateSubtitles(yrs) {
    const n = yrs.length;
    const txt = n ? `${yrs[0][0]}–${yrs[n - 1][0]} · ${n} annate` : 'in attesa dati…';
    $('#subProfile').textContent = `media dei 12 mesi · ${txt}`;
    $('#subAnnual').textContent = `serie completa · ${txt}`;
    $('#subMonthYears').textContent = `${CONFIG.months[state.month]} · ${txt}`;
    $('#myMonth').textContent = CONFIG.months[state.month];
  }

  function renderHistoryCharts() {
    if (!window.Chart) return;
    const yrs = yearsInRange();
    renderDaily(yrs); renderProfile(yrs); renderAnnual(yrs); renderMonthYears(yrs);
    updateSubtitles(yrs);
  }

  function renderSection(key) {
    if (!window.Chart) return;
    const yrs = yearsInRange();
    if (key === 'forecast' && state.fcHourly) Charts.renderForecast(state.fcHourly, state.metrics.forecast);
    else if (key === 'daily') renderDaily(yrs);
    else if (key === 'profile') renderProfile(yrs);
    else if (key === 'annual') renderAnnual(yrs);
    else if (key === 'monthyears') renderMonthYears(yrs);
  }

  /* ── UI binding ── */
  function bindUI() {
    const selMonth = $('#selMonth'), selFrom = $('#selFrom'), selTo = $('#selTo');
    CONFIG.months.forEach((m, i) => selMonth.add(new Option(m, i)));
    for (let y = CONFIG.archiveStart; y <= CY; y++) { selFrom.add(new Option(y, y)); selTo.add(new Option(y, y)); }
    selMonth.value = state.month; selFrom.value = state.yearFrom; selTo.value = state.yearTo;

    selMonth.addEventListener('change', () => { state.month = +selMonth.value; renderHistoryCharts(); });
    selFrom.addEventListener('change', () => {
      state.yearFrom = +selFrom.value;
      if (state.yearFrom > state.yearTo) { state.yearTo = state.yearFrom; selTo.value = state.yearTo; }
      renderHistoryCharts();
    });
    selTo.addEventListener('change', () => {
      state.yearTo = +selTo.value;
      if (state.yearTo < state.yearFrom) { state.yearFrom = state.yearTo; selFrom.value = state.yearFrom; }
      renderHistoryCharts();
    });

    $$('.tabs').forEach(group => {
      const section = group.dataset.section;
      group.addEventListener('click', e => {
        const btn = e.target.closest('.tab');
        if (!btn) return;
        group.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
        group.dataset.metric = btn.dataset.metric;
        state.metrics[section] = btn.dataset.metric;
        renderSection(section);
      });
    });

    $('#btnRefresh').addEventListener('click', () => refreshAll(true));
    window.addEventListener('resize', throttle(() => {
      if (sparkCache) drawSpark($('#spark'), sparkCache.v, sparkCache.c);
    }, 250));
  }

  /* ── refresh globale + auto-refresh ── */
  async function refreshAll(force) {
    if (state.loading) return;
    state.controller?.abort();
    state.controller = new AbortController();
    await Promise.all([loadForecast(force), loadHistory(force)]);
    nextRefresh = Date.now() + CONFIG.autoRefreshMs;
  }

  let pending = false;
  setInterval(() => {
    if (Date.now() >= nextRefresh) {
      if (document.hidden || state.loading) { pending = true; return; }
      refreshAll(true);
    }
  }, 4000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pending && Date.now() >= nextRefresh) { pending = false; refreshAll(true); }
  });

  /* ── scroll reveal ── */
  function revealInit() {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: .12 });
    $$('.reveal').forEach(el => io.observe(el));
  }

  function chartFallback() {
    $$('.chart-box').forEach(b => b.innerHTML = '<p class="chart-err">Grafici non disponibili (libreria non caricata).</p>');
  }

  /* ── boot ── */
  bindUI();
  revealInit();
  tickClock(); setInterval(tickClock, 1000);
  tickCountdown(); setInterval(tickCountdown, 1000);
  if (!window.Chart) chartFallback();
  refreshAll(false);   // prima visita: previsioni subito, storiche in progressivo
})();