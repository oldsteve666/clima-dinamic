window.Charts = (() => {
  if (!window.Chart) return { unavailable: true };

  const C = CONFIG.colors;
  Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
  Chart.defaults.font.size = 10;
  Chart.defaults.color = '#7d92b3';

  const inst = {};
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; };
  const grad = color => ctx => {
    const { ctx: c, chartArea } = ctx.chart;
    if (!chartArea) return hexA(color, .18);
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, hexA(color, .34)); g.addColorStop(1, hexA(color, 0));
    return g;
  };

  const line = (label, data, color, extra = {}) => ({
    type: 'line', label, data, borderColor: color, backgroundColor: 'transparent',
    borderWidth: 2, tension: .35, pointRadius: 0, pointHoverRadius: 4,
    pointHoverBackgroundColor: color, spanGaps: true, ...extra
  });
  const area = (label, data, color, extra = {}) => ({ ...line(label, data, color, extra), fill: true, backgroundColor: grad(color) });
  const bar  = (label, data, color, extra = {}) => ({
    type: 'bar', label, data, backgroundColor: hexA(color, .7), hoverBackgroundColor: color,
    borderRadius: 3, borderSkipped: false, maxBarThickness: 24, ...extra
  });
  const dashed = (label, data, color) => ({
    type: 'line', label, data, borderColor: hexA(color, .8), borderDash: [6, 5],
    borderWidth: 1.5, pointRadius: 0, tension: .2, spanGaps: true
  });

  const fmtVal = (m, v) => v == null ? '—'
    : m === 'temp' ? (+v).toFixed(1) + ' °C'
    : m === 'rain' ? (+v).toFixed(1) + ' mm'
    : Math.round(v) + ' %';

  function scales({ y } = {}) {
    const s = {
      x: { grid: { display: false }, border: { color: hexA('#94a8c6', .18) },
           ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } },
      y: { grid: { color: hexA('#94a8c6', .08) }, border: { display: false }, ticks: { padding: 6 } }
    };
    if (y) s.y.title = { display: true, text: y, color: '#5c7397', font: { size: 9 } };
    return s;
  }

  function options(sc, { legend = false, metric = 'temp' } = {}) {
    return {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 650, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legend
          ? { display: true, position: 'top', align: 'end',
              labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, boxHeight: 6, padding: 14, color: '#94a8c6' } }
          : { display: false },
        tooltip: {
          backgroundColor: 'rgba(8,15,29,.96)', borderColor: '#24405f', borderWidth: 1,
          titleColor: '#e9f1fb', bodyColor: '#b9c9e0', padding: 12, cornerRadius: 10,
          boxPadding: 5, usePointStyle: true,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtVal(metric, c.parsed.y)}` }
        }
      },
      scales: sc
    };
  }

  function draw(id, labels, datasets, sc, o = {}) {
    const el = document.getElementById(id);
    if (!inst[id]) {
      inst[id] = new Chart(el, { type: 'bar', data: { labels, datasets }, options: options(sc, o) });
    } else {
      const ch = inst[id];
      ch.data.labels = labels;
      ch.data.datasets = datasets;
      ch.options = options(sc, o);
      ch.update();
    }
    el.closest('.chart-box')?.classList.add('ready');
  }

  /* regressione lineare per la linea di tendenza */
  function trendOf(values) {
    const pts = values.map((v, i) => [i, v]).filter(p => p[1] != null);
    if (pts.length < 4) return null;
    const n = pts.length; let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (const [x, yv] of pts) { sx += x; sy += yv; sxy += x * yv; sxx += x * x; }
    const den = n * sxx - sx * sx;
    if (!den) return null;
    const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
    return values.map((_, i) => +(a + b * i).toFixed(2));
  }

  return {
    renderForecast(p, m) {
      const ds = m === 'rain' ? [bar('Precipitazioni', p.rain, C.rain)]
        : m === 'hum' ? [area('Umidità relativa', p.hum, C.hum)]
        : [area('Temperatura', p.temp, C.temp)];
      draw('chartForecast', p.labels, ds, scales({ y: m === 'rain' ? 'mm' : m === 'hum' ? '%' : '°C' }), { metric: m });
    },
    renderDaily(p, m) {
      let ds, y;
      if (m === 'rain')      { ds = [bar('Precipitazioni', p.rain, C.rain)]; y = 'mm'; }
      else if (m === 'hum')  { ds = [area('Umidità media', p.hum, C.hum)];  y = '%'; }
      else { ds = [line('T. max', p.tmax, C.temp),
                   line('T. media', p.tmean, C.mean, { borderDash: [5, 4], borderWidth: 1.6 }),
                   line('T. min', p.tmin, C.cold)]; y = '°C'; }
      draw('chartDaily', p.labels, ds, scales({ y }), { metric: m, legend: m === 'temp' });
    },
    renderProfile(p, m) {
      let ds, y;
      if (m === 'rain')      { ds = [bar('Pioggia media/mese', p.rain, C.rain)]; y = 'mm'; }
      else if (m === 'hum')  { ds = [area('Umidità media', p.hum, C.hum)];       y = '%'; }
      else                   { ds = [area('T. media', p.temp, C.temp)];          y = '°C'; }
      draw('chartProfile', p.labels, ds, scales({ y }), { metric: m });
    },
    renderAnnual(p, m) {
      let ds, y, vals;
      if (m === 'rain')      { vals = p.rain; ds = [bar('Precipitazioni totali', vals, C.rain)]; y = 'mm'; }
      else if (m === 'hum')  { vals = p.hum;  ds = [area('Umidità media', vals, C.hum)];         y = '%'; }
      else                   { vals = p.temp; ds = [area('T. media annua', vals, C.temp)];       y = '°C'; }
      const tr = trendOf(vals);
      if (tr) ds.push(dashed('Trend', tr, '#e9f1fb'));
      draw('chartAnnual', p.labels, ds, scales({ y }), { metric: m, legend: !!tr });
    },
    renderMonthYears(p, m) {
      let ds, y;
      if (m === 'rain')      { ds = [bar('Pioggia del mese', p.rain, C.rain)]; y = 'mm'; }
      else if (m === 'hum')  { ds = [area('Umidità media', p.hum, C.hum)];     y = '%'; }
      else { ds = [line('T. max', p.tmax, C.temp),
                   line('T. media', p.tmean, C.mean, { borderDash: [5, 4], borderWidth: 1.6 }),
                   line('T. min', p.tmin, C.cold)]; y = '°C'; }
      draw('chartMonthYears', p.labels, ds, scales({ y }), { metric: m, legend: m === 'temp' });
    }
  };
})();