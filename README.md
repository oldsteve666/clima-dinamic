# 🌦️ Canale Monterano · Meteo Storico & Previsioni

App web dinamica per visualizzare i dati meteo storici (1965–oggi) e le previsioni a 7 giorni di Canale Monterano (Lazio, Italia).

## 🚀 Deploy su Netlify

### Opzione 1 — Netlify Drop
1. Trascina la cartella del progetto su [app.netlify.com/drop](https://app.netlify.com/drop)
2. Fatto. Il sito è online.

### Opzione 2 — Git deploy
1. Pusha il repo su GitHub/GitLab
2. Collega il repo a Netlify
3. Build settings: **Publish directory** = `.` (nessuna build necessaria)

## 🏗️ Architettura

- **Vanilla JS + ES Modules** — zero bundler, zero dipendenze build
- **IndexedDB** — cache intelligente dei dati storici (TTL 24h)
- **Chart.js 4** — grafici interattivi con tema dark custom
- **Open-Meteo API** — dati ERA5 (storico) e forecast

## ⚡ Ottimizzazioni performance

| Tecnica | Beneficio |
|---------|-----------|
| IndexedDB + TTL | Primo caricamento ~1s, successivi istantanei |
| Debounce controlli | Evita richieste multiple durante selezione |
| Lazy chart destroy | Evita memory leak cambiando tab |
| Preconnect fonts | -200ms FCP |
| Chart.js defer | Non blocca il rendering iniziale |
| Cache-Control immutable | CDN edge caching 1 anno per asset |
| Compressione Brotli | -70% payload su Netlify |

## 📊 Sezioni

1. **Previsioni 7gg** — cards giornaliere + 3 grafici orari
2. **Mese selezionato** — andamento giornaliero del mese corrente
3. **Mese negli anni** — trend storico del mese nel range scelto
4. **Profilo medio** — climatologia mensile (medie 12 mesi)
5. **Andamento annuale** — serie storica completa anno per anno

## 🎨 Design

Dark theme glassmorphism con:
- Gradient hero animato
- Cards con hover effects
- Toast notifications
- Loader modale
- Responsive mobile-first

## 🔧 Configurazione

Coordinate e range anni sono configurabili in `js/api.js`:
```js
const LAT = 42.1328;
const LON = 12.1056;