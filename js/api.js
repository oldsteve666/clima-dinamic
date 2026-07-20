import { cacheGet, cacheSet } from './cache.js';

const LAT = 42.1328;
const LON = 12.1056;
const TZ = 'Europe/Rome';
const BASE_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const BASE_FORECAST = 'https://api.open-meteo.com/v1/forecast';

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function archiveKey(yearFrom, yearTo) {
  return `archive:${yearFrom}-${yearTo}`;
}

export async function fetchArchive(yearFrom, yearTo, onProgress) {
  const key = archiveKey(yearFrom, yearTo);
  const cached = await cacheGet(key, 24 * 60 * 60 * 1000);
  if (cached) {
    onProgress?.('Dati da cache locale');
    return cached;
  }

  onProgress?.('Scarico dati storici…');
  const start = `${yearFrom}-01-01`;
  
  // Open-Meteo Archive richiede date nel passato. ERA5 ha un ritardo di ~5-7 giorni.
  // Calcoliamo una data di fine sicura per evitare errori 400 (Bad Request).
  const safeDate = new Date();
  safeDate.setDate(safeDate.getDate() - 7);
  const maxArchiveDate = safeDate.toISOString().split('T')[0];
  
  const requestedEnd = `${yearTo}-12-31`;
  const end = requestedEnd > maxArchiveDate ? maxArchiveDate : requestedEnd;
  const finalStart = start > maxArchiveDate ? maxArchiveDate : start;

  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    start_date: finalStart,
    end_date: end,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation',
    timezone: TZ
  });

  const url = `${BASE_ARCHIVE}?${params.toString()}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${errText}`);
  }
  
  const data = await res.json();
  await cacheSet(key, data);
  return data;
}

export async function fetchForecast() {
  const key = 'forecast:7d';
  const cached = await cacheGet(key, 10 * 60 * 1000);
  if (cached) return cached;

  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode',
    hourly: 'temperature_2m,precipitation_probability,precipitation,relative_humidity_2m',
    timezone: TZ,
    forecast_days: 7
  });

  const res = await fetch(`${BASE_FORECAST}?${params}`);
  if (!res.ok) throw new Error(`Forecast API error ${res.status}`);
  const data = await res.json();
  await cacheSet(key, data);
  return data;
}

export function extractMonthDaily(archiveData, year, month) {
  const daily = archiveData.daily;
  const hourly = archiveData.hourly;
  if (!daily || !hourly) return null;

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const days = [];
  
  for (let i = 0; i < daily.time.length; i++) {
    if (daily.time[i].startsWith(prefix)) {
      days.push({
        date: daily.time[i],
        tmax: daily.temperature_2m_max[i],
        tmin: daily.temperature_2m_min[i],
        precip: daily.precipitation_sum[i] || 0
      });
    }
  }

  const humByDay = {};
  for (let i = 0; i < hourly.time.length; i++) {
    const t = hourly.time[i];
    if (!t.startsWith(prefix)) continue;
    const day = t.slice(0, 10);
    if (!humByDay[day]) humByDay[day] = { sum: 0, count: 0 };
    if (hourly.relative_humidity_2m[i] != null) {
      humByDay[day].sum += hourly.relative_humidity_2m[i];
      humByDay[day].count++;
    }
  }
  
  days.forEach(d => {
    const h = humByDay[d.date];
    d.hum = h && h.count ? Math.round(h.sum / h.count) : null;
  });

  return days;
}

export function extractMonthYearly(archiveData, month, yearFrom, yearTo) {
  const result = [];
  for (let y = yearFrom; y <= yearTo; y++) {
    const days = extractMonthDaily(archiveData, y, month);
    if (!days || !days.length) continue;
    const tmax = days.reduce((a, d) => a + (d.tmax ?? 0), 0) / days.length;
    const tmin = days.reduce((a, d) => a + (d.tmin ?? 0), 0) / days.length;
    const tavg = (tmax + tmin) / 2;
    const precip = days.reduce((a, d) => a + (d.precip ?? 0), 0);
    const hums = days.map(d => d.hum).filter(v => v != null);
    const hum = hums.length ? hums.reduce((a, b) => a + b, 0) / hums.length : null;
    result.push({ year: y, tmax, tmin, tavg, precip, hum });
  }
  return result;
}

export function extractProfile(archiveData, yearFrom, yearTo) {
  const profile = [];
  for (let m = 1; m <= 12; m++) {
    const yearly = extractMonthYearly(archiveData, m, yearFrom, yearTo);
    if (!yearly.length) { profile.push(null); continue; }
    const tavg = yearly.reduce((a, y) => a + y.tavg, 0) / yearly.length;
    const tmax = yearly.reduce((a, y) => a + y.tmax, 0) / yearly.length;
    const tmin = yearly.reduce((a, y) => a + y.tmin, 0) / yearly.length;
    const precip = yearly.reduce((a, y) => a + y.precip, 0) / yearly.length;
    const hums = yearly.map(y => y.hum).filter(v => v != null);
    const hum = hums.length ? hums.reduce((a, b) => a + b, 0) / hums.length : null;
    profile.push({ month: m, tavg, tmax, tmin, precip, hum });
  }
  return profile;
}

export function extractYearly(archiveData, yearFrom, yearTo) {
  const result = [];
  for (let y = yearFrom; y <= yearTo; y++) {
    const daily = archiveData.daily;
    const hourly = archiveData.hourly;
    const prefix = String(y);
    const days = [];
    
    for (let i = 0; i < daily.time.length; i++) {
      if (daily.time[i].startsWith(prefix)) {
        days.push({
          tmax: daily.temperature_2m_max[i],
          tmin: daily.temperature_2m_min[i],
          precip: daily.precipitation_sum[i] || 0
        });
      }
    }
    if (!days.length) continue;
    
    const tavg = days.reduce((a, d) => a + ((d.tmax + d.tmin) / 2), 0) / days.length;
    const precip = days.reduce((a, d) => a + d.precip, 0);

    let hsum = 0, hcount = 0;
    for (let i = 0; i < hourly.time.length; i++) {
      if (hourly.time[i].startsWith(prefix) && hourly.relative_humidity_2m[i] != null) {
        hsum += hourly.relative_humidity_2m[i];
        hcount++;
      }
    }
    const hum = hcount ? hsum / hcount : null;
    result.push({ year: y, tavg, precip, hum });
  }
  return result;
}