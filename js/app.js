import { fetchArchive, fetchForecast, extractMonthDaily, extractMonthYearly, extractProfile, extractYearly, debounce } from './api.js';
import * as charts from './charts.js';
import * as ui from './ui.js';
import { cacheClear } from './cache.js';

const currentYear = new Date().getFullYear();

const state = {
  month: new Date().getMonth() + 1,
  yearFrom: 2000,
  yearTo: currentYear,
  archive: null
};

async function loadArchive(onProgress) {
  state.archive = await fetchArchive(state.yearFrom, state.yearTo, onProgress);
}

function renderMonthDaily() {
  const data = extractMonthDaily(state.archive, state.yearTo, state.month);
  if (!data || !data.length) return;
  document.getElementById('monthDailyTitle').textContent = `${ui.monthName(state.month)} ${state.yearTo}`;
  const labels = data.map(d => d.date.slice(8));
  charts.renderMonthDailyTemp(labels, data.map(d => d.tmax), data.map(d => d.tmin));
  charts.renderMonthDailyPrecip(labels, data.map(d => d.precip));
  charts.renderMonthDailyHum(labels, data.map(d => d.hum));
}

function renderMonthYearly() {
  const data = extractMonthYearly(state.archive, state.month, state.yearFrom, state.yearTo);
  if (!data.length) return;
  document.getElementById('monthYearlyTitle').textContent = ui.monthName(state.month);
  const labels = data.map(d => d.year);
  charts.renderMonthYearlyTemp(labels, data.map(d => d.tmax), data.map(d => d.tavg), data.map(d => d.tmin));
  charts.renderMonthYearlyPrecip(labels, data.map(d => d.precip));
  charts.renderMonthYearlyHum(labels, data.map(d => d.hum));
}

function renderProfile() {
  const data = extractProfile(state.archive, state.yearFrom, state.yearTo);
  const valid = data.filter(Boolean);
  if (!valid.length) return;
  const labels = data.map((_, i) => ui.monthShort(i + 1));
  charts.renderProfileTemp(labels, data.map(d => d?.tmax), data.map(d => d?.tavg), data.map(d => d?.tmin));
  charts.renderProfilePrecip(labels, data.map(d => d?.precip));
  charts.renderProfileHum(labels, data.map(d => d?.hum));
}

function renderYearly() {
  const data = extractYearly(state.archive, state.yearFrom, state.yearTo);
  if (!data.length) return;
  const labels = data.map(d => d.year);
  charts.renderYearlyTemp(labels, data.map(d => d.tavg));
  charts.renderYearlyPrecip(labels, data.map(d => d.precip));
  charts.renderYearlyHum(labels, data.map(d => d.hum));
}

async function renderForecast() {
  try {
    const data = await fetchForecast();
    ui.renderForecastGrid(data.daily);

    const dailyLabels = data.daily.time.map(t => {
      const d = new Date(t);
      return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
    });
    charts.renderForecastTemp(dailyLabels, data.daily.temperature_2m_max, data.daily.temperature_2m_min);
    charts.renderForecastPrecip(dailyLabels, data.daily.precipitation_sum, data.daily.precipitation_probability_max);

    const humAvg = data.daily.time.map((t, i) => {
      const day = t;
      let sum = 0, count = 0;
      for (let j = 0; j < data.hourly.time.length; j++) {
        if (data.hourly.time[j].startsWith(day) && data.hourly.relative_humidity_2m[j] != null) {
          sum += data.hourly.relative_humidity_2m[j];
          count++;
        }
      }
      return count ? sum / count : null;
    });
    charts.renderForecastHum(dailyLabels, humAvg);
  } catch (e) {
    ui.showToast('Errore previsioni: ' + e.message, 'error');
  }
}

async function refreshAll() {
  ui.showLoader('Scarico dati storici…');
  try {
    await loadArchive((msg) => { document.getElementById('loaderText').textContent = msg; });
    renderMonthDaily();
    renderMonthYearly();
    renderProfile();
    renderYearly();
    ui.setLastUpdate();
    ui.showToast('Dati aggiornati', 'success');
  } catch (e) {
    console.error(e);
    ui.showToast('Errore caricamento: ' + e.message, 'error');
  } finally {
    ui.hideLoader();
  }
}

function bindControls() {
  const selMonth = document.getElementById('selMonth');
  const selFrom = document.getElementById('selYearFrom');
  const selTo = document.getElementById('selYearTo');

  ui.populateMonthSelect(selMonth);
  ui.populateYearSelect(selFrom, 1965, currentYear, state.yearFrom);
  ui.populateYearSelect(selTo, 1965, currentYear, state.yearTo);

  selMonth.addEventListener('change', () => {
    state.month = +selMonth.value;
    renderMonthDaily();
    renderMonthYearly();
  });

  const updateYears = debounce(async () => {
    state.yearFrom = +selFrom.value;
    state.yearTo = +selTo.value;
    if (state.yearFrom > state.yearTo) {
      state.yearTo = state.yearFrom;
      selTo.value = state.yearTo;
    }
    await refreshAll();
  }, 400);

  selFrom.addEventListener('change', updateYears);
  selTo.addEventListener('change', updateYears);

  document.getElementById('btnRefresh').addEventListener('click', refreshAll);
  document.getElementById('btnClearCache').addEventListener('click', async () => {
    await cacheClear();
    ui.showToast('Cache svuotata', 'success');
  });
}

/* ==========================================
   AVVIO APPLICAZIONE (con debug e protezioni)
   ========================================== */

async function init() {
  console.log('🚀 [INIT] Avvio applicazione...');
  
  try {
    document.getElementById('year').textContent = new Date().getFullYear();
    ui.setupTabs();
    bindControls();
    console.log('✅ [INIT] Controlli inizializzati');

    await refreshAll();
    console.log('✅ [INIT] Dati storici caricati');

    await renderForecast();
    console.log('✅ [INIT] Previsioni caricate');

    setInterval(renderForecast, 10 * 60 * 1000);
    console.log('✅ [INIT] Auto-refresh attivato');
  } catch (e) {
    console.error('❌ [INIT] Errore critico:', e);
    ui.hideLoader(); 
    ui.showToast('Errore inizializzazione: ' + e.message, 'error');
  }
}

function waitForChartJs(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (typeof Chart !== 'undefined') {
        console.log('✅ [CHART.JS] Libreria caricata');
        return resolve();
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Timeout: Chart.js non si è caricato in 15s'));
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function onReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(async () => {
  console.log('📄 [DOM] Documento pronto');
  try {
    await waitForChartJs();
    await init();
  } catch (e) {
    console.error('❌ [BOOT] Errore fatale:', e);
    ui.hideLoader();
    ui.showToast(e.message, 'error');
  }
});