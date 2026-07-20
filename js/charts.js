// Tema globale Chart.js dark
const COLORS = {
  temp: '#f87171',
  tempMax: '#f87171',
  tempMin: '#60a5fa',
  tempAvg: '#fbbf24',
  precip: '#22d3ee',
  hum: '#34d399',
  grid: 'rgba(255,255,255,0.06)',
  tick: '#9a9ab0',
  tooltip: '#1b1b2a'
};

const chartInstances = new Map();

function baseOptions(yTitle, unit=''){
  return {
    responsive:true,
    maintainAspectRatio:false,
    animation:{duration:600, easing:'easeOutQuart'},
    interaction:{mode:'index', intersect:false},
    plugins:{
      legend:{
        labels:{color:COLORS.tick, font:{size:11}, boxWidth:10, padding:12}
      },
      tooltip:{
        backgroundColor:COLORS.tooltip,
        borderColor:'rgba(255,255,255,0.1)',
        borderWidth:1,
        titleColor:'#fff',
        bodyColor:'#e8e8f0',
        padding:10,
        cornerRadius:8,
        displayColors:true,
        callbacks:{
          label:(ctx)=>`${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) ?? '-'}${unit}`
        }
      }
    },
    scales:{
      x:{
        ticks:{color:COLORS.tick, maxRotation:0, autoSkip:true, maxTicksLimit:12, font:{size:10}},
        grid:{color:COLORS.grid}
      },
      y:{
        title:{display:true, text:yTitle, color:COLORS.tick, font:{size:11}},
        ticks:{color:COLORS.tick, font:{size:10}},
        grid:{color:COLORS.grid}
      }
    }
  };
}

function getOrCreate(canvasId, config){
  const existing = chartInstances.get(canvasId);
  if(existing){ existing.destroy(); }
  const ctx = document.getElementById(canvasId);
  if(!ctx) return null;
  const chart = new Chart(ctx, config);
  chartInstances.set(canvasId, chart);
  return chart;
}

export function destroyAll(){
  chartInstances.forEach(c=>c.destroy());
  chartInstances.clear();
}

// ===== FORECAST =====
export function renderForecastTemp(labels, max, min){
  getOrCreate('chartForecastTemp', {
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Max °C', data:max, borderColor:COLORS.tempMax, backgroundColor:'rgba(248,113,113,.15)', fill:true, tension:.35, pointRadius:0, borderWidth:2},
        {label:'Min °C', data:min, borderColor:COLORS.tempMin, backgroundColor:'rgba(96,165,250,.15)', fill:true, tension:.35, pointRadius:0, borderWidth:2}
      ]
    },
    options:baseOptions('°C','°C')
  });
}

export function renderForecastPrecip(labels, precip, prob){
  getOrCreate('chartForecastPrecip', {
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Precipitazioni mm', data:precip, backgroundColor:COLORS.precip, borderRadius:4},
        {label:'Probabilità %', data:prob, type:'line', borderColor:COLORS.hum, backgroundColor:'transparent', tension:.3, pointRadius:0, borderWidth:2, yAxisID:'y1'}
      ]
    },
    options:{
      ...baseOptions('mm','mm'),
      scales:{
        ...baseOptions('mm','mm').scales,
        y1:{position:'right', title:{display:true,text:'%', color:COLORS.tick}, ticks:{color:COLORS.tick}, grid:{drawOnChartArea:false}, min:0, max:100}
      }
    }
  });
}

export function renderForecastHum(labels, hum){
  getOrCreate('chartForecastHum', {
    type:'line',
    data:{
      labels,
      datasets:[{label:'Umidità %', data:hum, borderColor:COLORS.hum, backgroundColor:'rgba(52,211,153,.15)', fill:true, tension:.35, pointRadius:0, borderWidth:2}]
    },
    options:baseOptions('%','%')
  });
}

// ===== MONTH DAILY =====
export function renderMonthDailyTemp(labels, max, min){
  const avg = max.map((v,i)=> v!=null && min[i]!=null ? (v+min[i])/2 : null);
  getOrCreate('chartMonthDailyTemp', {
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Max', data:max, borderColor:COLORS.tempMax, tension:.3, pointRadius:1, borderWidth:2},
        {label:'Media', data:avg, borderColor:COLORS.tempAvg, borderDash:[4,4], tension:.3, pointRadius:0, borderWidth:2},
        {label:'Min', data:min, borderColor:COLORS.tempMin, tension:.3, pointRadius:1, borderWidth:2}
      ]
    },
    options:baseOptions('°C','°C')
  });
}

export function renderMonthDailyPrecip(labels, data){
  getOrCreate('chartMonthDailyPrecip', {
    type:'bar',
    data:{labels, datasets:[{label:'mm', data, backgroundColor:COLORS.precip, borderRadius:3}]},
    options:baseOptions('mm','mm')
  });
}

export function renderMonthDailyHum(labels, data){
  getOrCreate('chartMonthDailyHum', {
    type:'line',
    data:{labels, datasets:[{label:'%', data, borderColor:COLORS.hum, backgroundColor:'rgba(52,211,153,.15)', fill:true, tension:.35, pointRadius:0, borderWidth:2}]},
    options:baseOptions('%','%')
  });
}

// ===== MONTH YEARLY =====
export function renderMonthYearlyTemp(labels, max, avg, min){
  getOrCreate('chartMonthYearlyTemp', {
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Max', data:max, borderColor:COLORS.tempMax, tension:.3, pointRadius:2, borderWidth:2},
        {label:'Media', data:avg, borderColor:COLORS.tempAvg, tension:.3, pointRadius:2, borderWidth:2},
        {label:'Min', data:min, borderColor:COLORS.tempMin, tension:.3, pointRadius:2, borderWidth:2}
      ]
    },
    options:baseOptions('°C','°C')
  });
}

export function renderMonthYearlyPrecip(labels, data){
  getOrCreate('chartMonthYearlyPrecip', {
    type:'bar',
    data:{labels, datasets:[{label:'mm', data, backgroundColor:COLORS.precip, borderRadius:4}]},
    options:baseOptions('mm','mm')
  });
}

export function renderMonthYearlyHum(labels, data){
  getOrCreate('chartMonthYearlyHum', {
    type:'line',
    data:{labels, datasets:[{label:'%', data, borderColor:COLORS.hum, backgroundColor:'rgba(52,211,153,.15)', fill:true, tension:.35, pointRadius:2, borderWidth:2}]},
    options:baseOptions('%','%')
  });
}

// ===== PROFILE =====
// ✅ MODIFICATO: ora è un grafico a linee con tre curve continue (Max, Media, Min)
export function renderProfileTemp(labels, max, avg, min){
  getOrCreate('chartProfileTemp', {
    type:'line',
    data:{
      labels,
      datasets:[
        {
          label:'Max',
          data:max,
          borderColor:COLORS.tempMax,
          backgroundColor:'rgba(248,113,113,.10)',
          fill:false,
          tension:.4,
          pointRadius:3,
          pointHoverRadius:6,
          pointBackgroundColor:COLORS.tempMax,
          borderWidth:2
        },
        {
          label:'Media',
          data:avg,
          borderColor:COLORS.tempAvg,
          backgroundColor:'rgba(251,191,36,.15)',
          fill:true,
          tension:.4,
          pointRadius:3,
          pointHoverRadius:6,
          pointBackgroundColor:COLORS.tempAvg,
          borderWidth:2.5
        },
        {
          label:'Min',
          data:min,
          borderColor:COLORS.tempMin,
          backgroundColor:'rgba(96,165,250,.10)',
          fill:false,
          tension:.4,
          pointRadius:3,
          pointHoverRadius:6,
          pointBackgroundColor:COLORS.tempMin,
          borderWidth:2
        }
      ]
    },
    options:baseOptions('°C','°C')
  });
}

export function renderProfilePrecip(labels, data){
  getOrCreate('chartProfilePrecip', {
    type:'bar',
    data:{labels, datasets:[{label:'mm', data, backgroundColor:COLORS.precip, borderRadius:4}]},
    options:baseOptions('mm','mm')
  });
}

export function renderProfileHum(labels, data){
  getOrCreate('chartProfileHum', {
    type:'line',
    data:{labels, datasets:[{label:'%', data, borderColor:COLORS.hum, backgroundColor:'rgba(52,211,153,.2)', fill:true, tension:.35, pointRadius:3, borderWidth:2}]},
    options:baseOptions('%','%')
  });
}

// ===== YEARLY =====
export function renderYearlyTemp(labels, data){
  getOrCreate('chartYearlyTemp', {
    type:'line',
    data:{labels, datasets:[{label:'°C', data, borderColor:COLORS.tempAvg, backgroundColor:'rgba(251,191,36,.15)', fill:true, tension:.3, pointRadius:2, borderWidth:2}]},
    options:baseOptions('°C','°C')
  });
}

export function renderYearlyPrecip(labels, data){
  getOrCreate('chartYearlyPrecip', {
    type:'bar',
    data:{labels, datasets:[{label:'mm', data, backgroundColor:COLORS.precip, borderRadius:4}]},
    options:baseOptions('mm','mm')
  });
}

export function renderYearlyHum(labels, data){
  getOrCreate('chartYearlyHum', {
    type:'line',
    data:{labels, datasets:[{label:'%', data, borderColor:COLORS.hum, backgroundColor:'rgba(52,211,153,.15)', fill:true, tension:.3, pointRadius:2, borderWidth:2}]},
    options:baseOptions('%','%')
  });
}