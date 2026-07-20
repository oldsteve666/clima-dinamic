window.CONFIG = {
  lat: 42.1328,
  lon: 12.1056,
  place: 'Canale Monterano (RM)',
  tz: 'Europe/Rome',
  archiveStart: 1965,
  concurrency: 5,                    // richieste parallele verso l'archivio
  autoRefreshMs: 10 * 60 * 1000,     // 10 minuti
  forecastTtl: 9 * 60 * 1000,        // cache previsioni
  volatileYearTtl: 6 * 3600 * 1000,  // cache anno corrente
  months: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
  monthsShort: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
  daysShort: ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'],
  colors: {
    temp: '#ffb454', cold: '#7dd3fc', rain: '#5db9ff', hum: '#3fe0b5', mean: '#ffd9a1'
  }
};