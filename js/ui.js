const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// Weather code -> emoji
const WMO = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌦️',
  61:'🌧️',63:'🌧️',65:'🌧️',
  71:'🌨️',73:'🌨️',75:'🌨️',77:'❄️',
  80:'🌦️',81:'🌧️',82:'⛈️',
  85:'🌨️',86:'🌨️',
  95:'⛈️',96:'⛈️',99:'⛈️'
};

export function populateMonthSelect(sel){
  sel.innerHTML = '';
  MONTHS_IT.forEach((m,i)=>{
    const opt = document.createElement('option');
    opt.value = i+1;
    opt.textContent = m;
    sel.appendChild(opt);
  });
  sel.value = new Date().getMonth()+1;
}

export function populateYearSelect(sel, from, to, selected){
  sel.innerHTML = '';
  const currentYear = new Date().getFullYear();
  const maxYear = Math.min(to, currentYear);
  const minYear = Math.max(from, 1940);
  
  for(let y=maxYear; y>=minYear; y--){
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }
  sel.value = selected ?? maxYear;
}

export function renderForecastGrid(daily){
  const grid = document.getElementById('forecastGrid');
  grid.innerHTML = '';
  const today = new Date();
  daily.time.forEach((t,i)=>{
    const d = new Date(t);
    const isToday = d.toDateString() === today.toDateString();
    const code = daily.weathercode?.[i] ?? 0;
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `
      <div class="day-card__date">${isToday?'Oggi':d.toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'})}</div>
      <div class="day-card__icon">${WMO[code]||'🌡️'}</div>
      <div class="day-card__temp">${Math.round(daily.temperature_2m_max[i])}° <small>/ ${Math.round(daily.temperature_2m_min[i])}°</small></div>
      <div class="day-card__meta">🌧️ ${daily.precipitation_sum[i]??0} mm · ${daily.precipitation_probability_max[i]??0}%</div>
    `;
    grid.appendChild(card);
  });
}

export function showToast(msg, type='info', duration=3500){
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>{
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    setTimeout(()=>el.remove(), 300);
  }, duration);
}

export function showLoader(text='Caricamento…'){
  const l = document.getElementById('loader');
  document.getElementById('loaderText').textContent = text;
  l.style.display = 'flex';
  l.hidden = false;
}

export function hideLoader(){
  const l = document.getElementById('loader');
  l.style.display = 'none';
  l.hidden = true;
}

export function setLastUpdate(){
  const el = document.getElementById('lastUpdate');
  const now = new Date();
  el.textContent = `Ultimo aggiornamento: ${now.toLocaleString('it-IT')}`;
}

export function monthName(m){ return MONTHS_IT[m-1] || '—'; }
export function monthShort(m){ return MONTHS_SHORT[m-1] || '—'; }

export function setupTabs(){
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      const target = tab.dataset.tab;
      tabs.forEach(t=>t.classList.toggle('active', t===tab));
      panels.forEach(p=>{
        p.hidden = p.dataset.panel !== target;
      });
      // TRICK: forza Chart.js a ricalcolare le dimensioni dei grafici nel tab appena mostrato
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    });
  });
}