import { cacheGet, cacheSet } from './cache.js';

const LAT = 42.1328;
const LON = 12.1056;
const TZ = 'Europe/Rome';
const BASE_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const BASE_FORECAST = 'https://api.open-meteo.com/v1/forecast';

// Debounce utility
export function debounce(fn, ms=300){
  let t;
  return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

// Costruisce la chiave cache per un range di date
function archiveKey(yearFrom, yearTo){
  return `archive:${yearFrom}-${yearTo}`;
}

/**
 * Scarica i dati storici per un range di anni.
 * Usa cache IndexedDB con TTL di 24h (i dati storici non cambiano).
 */
export async function fetchArchive(yearFrom, yearTo, onProgress){
  const key = archiveKey(yearFrom, yearTo);
  const cached = await cacheGet(key, 24*60*60*1000);
  if(cached){
    onProgress?.('Dati da cache locale');
    return cached;
  }

  onProgress?.('Scarico dati storici…');
  const start = `${yearFrom}-01-01`;
  const end = `${yearTo}-12-31`;

  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    start_date: start,
    end_date: end,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation',
    timezone: TZ
  });

  const res = await fetch(`${BASE_ARCHIVE}?${params}`);
  if(!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();

  await cacheSet(key, data);
  return data;
}

/**
 * Scarica le previsioni 7 giorni.
 * Cache TTL 10 minuti.
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

/**
 * Estrae i dati giornalieri di un mese specifico aggregando i dati hourly.
 */
export function extractMonthDaily(archiveData, year, month){
  // month: 1-12
  const daily = archiveData.daily;
  const hourly = archiveData.hourly;
  if(!daily || !hourly) return null;

  const prefix = `${year}-${String(month).padStart(2,'0')}`;

  // Daily arrays: temperature max/min, precipitation
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

  // Humidity media giornaliera da hourly
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

/**
 * Aggrega i dati di un mese su più anni.
 */
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

/**
 * Profilo mensile medio: media di ogni mese su tutti gli anni del range.
 */
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

/**
 * Andamento annuale: media annuale di ogni anno.
 */
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

    // humidity
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