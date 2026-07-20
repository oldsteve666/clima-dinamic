import { cacheGet, cacheGetStale, cacheSet } from './cache.js';

const LAT = 42.1328;
const LON = 12.1056;
const TZ = 'Europe/Rome';
const BASE_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const BASE_FORECAST = 'https://api.open-meteo.com/v1/forecast';

// Anni passati: i dati ERA5 non cambiano → cache 1 anno
// Anno corrente: cache 24 ore
const YEAR_TTL_PAST = 365 * 24 * 60 * 60 * 1000;
const YEAR_TTL_CURRENT = 24 * 60 * 60 * 1000;

export function debounce(fn, ms=300){
  let t;
  return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ERA5 ha un ritardo di ~5 giorni: calcola l'ultima data disponibile
function getSafeEndDate(){
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().split('T')[0];
}

// ✅ Richiesta piccola: un solo anno, solo umidità oraria (payload -66%)
async function fetchYearFromAPI(year){
  const safeEnd = getSafeEndDate();
  const start = `${year}-01-01`;
  let end = `${year}-12-31`;
  if (end > safeEnd) end = safeEnd;
  if (start > safeEnd) return null; // anno futuro: nessun dato

  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    start_date: start,
    end_date: end,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    hourly: 'relative_humidity_2m',
    timezone: TZ
  });

  const res = await fetch(`${BASE_ARCHIVE}?${params}`);
  if(!res.ok){
    const errText = await res.text().catch(()=>'');
    const err = new Error(`API error ${res.status}: ${errText}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

// ✅ Cache per singolo anno + fallback su dati scaduti
async function fetchSingleYear(year){
  const key = `archive:year:${year}`;
  const currentYear = new Date().getFullYear();
  const ttl = year >= currentYear ? YEAR_TTL_CURRENT : YEAR_TTL_PAST;

  const cached = await cacheGet(key, ttl);
  if (cached) return { data: cached, fromCache: true };

  try {
    const data = await fetchYearFromAPI(year);
    if (data) await cacheSet(key, data);
    return { data, fromCache: false };
  } catch (e) {
    // Fallback: usa la cache anche se scaduta (meglio di niente)
    const stale = await cacheGetStale(key);
    if (stale) return { data: stale, fromCache: true, stale: true };
    throw e;
  }
}

// Unisce i dati dei singoli anni in un unico archivio
function mergeArchiveData(list){
  const merged = {
    daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [] },
    hourly: { time: [], relative_humidity_2m: [] }
  };
  for (const yd of list) {
    if (!yd) continue;
    const d = yd.daily, h = yd.hourly;
    if (d) {
      merged.daily.time.push(...(d.time || []));
      merged.daily.temperature_2m_max.push(...(d.temperature_2m_max || []));
      merged.daily.temperature_2m_min.push(...(d.temperature_2m_min || []));
      merged.daily.precipitation_sum.push(...(d.precipitation_sum || []));
    }
    if (h) {
      merged.hourly.time.push(...(h.time || []));
      merged.hourly.relative_humidity_2m.push(...(h.relative_humidity_2m || []));
    }
  }
  return merged;
}

/**
 * ✅ NUOVA ARCHITETTURA: scarica anno per anno.
 * - Anni già in cache → istantanei, zero richieste API
 * - Solo gli anni mancanti vengono scaricati (con pausa 200ms)
 * - In caso di 429 → usa gli anni già raccolti + cache scaduta
 */
export async function fetchArchive(yearFrom, yearTo, onProgress){
  // Fallback legacy: vecchia chiave cache unica (se presente)
  const legacyKey = `archive:${yearFrom}-${yearTo}`;
  const legacy = await cacheGet(legacyKey, 24*60*60*1000);
  if (legacy && legacy.daily) {
    onProgress?.('Dati da cache locale');
    return legacy;
  }

  const total = yearTo - yearFrom + 1;
  const collected = [];
  const failedYears = [];
  let networkCount = 0;
  let rateLimited = false;

  for (let y = yearFrom; y <= yearTo; y++){
    onProgress?.(`Anno ${y} (${y - yearFrom + 1}/${total})…`);
    try {
      const res = await fetchSingleYear(y);
      if (res.data) collected.push(res.data);
      if (!res.fromCache) {
        networkCount++;
        await sleep(200); // richiesta "gentile" verso l'API
      }
    } catch(e){
      if (e.status === 429) {
        // Limite raggiunto: inutile insistere, segna gli anni rimanenti
        rateLimited = true;
        for (let yy = y; yy <= yearTo; yy++) failedYears.push(yy);
        break;
      }
      failedYears.push(y);
    }
  }

  if (!collected.length) {
    // Ultima spiaggia: cache legacy scaduta
    const legacyStale = await cacheGetStale(legacyKey);
    if (legacyStale && legacyStale.daily) return legacyStale;
    throw new Error(rateLimited
      ? 'Limite giornaliero API raggiunto e nessuna cache disponibile. Riprova domani.'
      : 'Nessun dato disponibile per il periodo selezionato.');
  }

  const merged = mergeArchiveData(collected);
  merged._meta = { failedYears, networkCount, rateLimited };
  return merged;
}

/**
 * Previsioni 7 giorni — cache 10 minuti
 */
export async function fetchForecast(){
  const key = 'forecast:7d';
  const cached = await cacheGet(key, 10*60*1000);
  if(cached) return cached;

  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode',
    hourly: 'temperature_2m,precipitation_probability,precipitation,relative_humidity_2m',
    timezone: TZ,
    forecast_days: 7
  });

  const res = await fetch(`${BASE_FORECAST}?${params}`);
  if(!res.ok) throw new Error(`Forecast API error ${res.status}`);
  const data = await res.json();
  await cacheSet(key, data);
  return data;
}

// ===== FUNZIONI DI ESTRAZIONE (invariate) =====

export function extractMonthDaily(archiveData, year, month){
  const daily = archiveData.daily;
  const hourly = archiveData.hourly;
  if(!daily || !hourly) return null;

  const prefix = `${year}-${String(month).padStart(2,'0')}`;
  const days = [];
  for(let i=0;i<daily.time.length;i++){
    if(daily.time[i].startsWith(prefix)){
      days.push({
        date: daily.time[i],
        tmax: daily.temperature_2m_max[i],
        tmin: daily.temperature_2m_min[i],
        precip: daily.precipitation_sum[i] || 0
      });
    }
  }

  const humByDay = {};
  for(let i=0;i<hourly.time.length;i++){
    const t = hourly.time[i];
    if(!t.startsWith(prefix)) continue;
    const day = t.slice(0,10);
    if(!humByDay[day]) humByDay[day] = {sum:0, count:0};
    if(hourly.relative_humidity_2m[i] != null){
      humByDay[day].sum += hourly.relative_humidity_2m[i];
      humByDay[day].count++;
    }
  }
  days.forEach(d=>{
    const h = humByDay[d.date];
    d.hum = h && h.count ? Math.round(h.sum/h.count) : null;
  });

  return days;
}

export function extractMonthYearly(archiveData, month, yearFrom, yearTo){
  const result = [];
  for(let y=yearFrom; y<=yearTo; y++){
    const days = extractMonthDaily(archiveData, y, month);
    if(!days || !days.length) continue;
    const tmax = days.reduce((a,d)=>a+(d.tmax??0),0)/days.length;
    const tmin = days.reduce((a,d)=>a+(d.tmin??0),0)/days.length;
    const tavg = (tmax+tmin)/2;
    const precip = days.reduce((a,d)=>a+(d.precip??0),0);
    const hums = days.map(d=>d.hum).filter(v=>v!=null);
    const hum = hums.length ? hums.reduce((a,b)=>a+b,0)/hums.length : null;
    result.push({year:y, tmax, tmin, tavg, precip, hum});
  }
  return result;
}

export function extractProfile(archiveData, yearFrom, yearTo){
  const profile = [];
  for(let m=1;m<=12;m++){
    const yearly = extractMonthYearly(archiveData, m, yearFrom, yearTo);
    if(!yearly.length){ profile.push(null); continue; }
    const tavg = yearly.reduce((a,y)=>a+y.tavg,0)/yearly.length;
    const tmax = yearly.reduce((a,y)=>a+y.tmax,0)/yearly.length;
    const tmin = yearly.reduce((a,y)=>a+y.tmin,0)/yearly.length;
    const precip = yearly.reduce((a,y)=>a+y.precip,0)/yearly.length;
    const hums = yearly.map(y=>y.hum).filter(v=>v!=null);
    const hum = hums.length ? hums.reduce((a,b)=>a+b,0)/hums.length : null;
    profile.push({month:m, tavg, tmax, tmin, precip, hum});
  }
  return profile;
}

export function extractYearly(archiveData, yearFrom, yearTo){
  const result = [];
  for(let y=yearFrom; y<=yearTo; y++){
    const daily = archiveData.daily;
    const hourly = archiveData.hourly;
    const prefix = String(y);
    const days = [];
    for(let i=0;i<daily.time.length;i++){
      if(daily.time[i].startsWith(prefix)){
        days.push({
          tmax: daily.temperature_2m_max[i],
          tmin: daily.temperature_2m_min[i],
          precip: daily.precipitation_sum[i] || 0
        });
      }
    }
    if(!days.length) continue;
    const tavg = days.reduce((a,d)=>a+((d.tmax+d.tmin)/2),0)/days.length;
    const precip = days.reduce((a,d)=>a+d.precip,0);

    let hsum=0, hcount=0;
    for(let i=0;i<hourly.time.length;i++){
      if(hourly.time[i].startsWith(prefix) && hourly.relative_humidity_2m[i]!=null){
        hsum += hourly.relative_humidity_2m[i];
        hcount++;
      }
    }
    const hum = hcount ? hsum/hcount : null;
    result.push({year:y, tavg, precip, hum});
  }
  return result;
}