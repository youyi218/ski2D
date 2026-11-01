// Landing page: one card per resort with a pixel thumbnail of its pistes, a few numbers and a way in.
// Uses only the small card.json summaries, so it opens quickly; the full data loads once a resort is picked.
import { PALETTES } from './palettes.js';
import { RESORTS, LAST_KEY } from './resorts.js';
import { t, pick, langSwitch, setLang } from './i18n.js';

const pal = PALETTES.warm;
const DIFF = ['green', 'blue', 'red', 'black'].map(k => [k, t('short_' + k)]);
const cap = s => s[0].toUpperCase() + s.slice(1);
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
let last = null;
try { last = localStorage.getItem(LAST_KEY); } catch {}

document.documentElement.classList.add('landing');
document.title = t('app');
const app = document.getElementById('app');
const ids = Object.keys(RESORTS);
const cards = await Promise.all(ids.map(id => RESORTS[id].card().then(m => m.default)));

app.innerHTML = `<main class="home-page">
  <header class="home-head">
    <span class="home-logo" aria-hidden="true"></span>
    <div><h1>${t('app')}</h1><p>${t('tagline')}</p></div>
    ${langSwitch()}
  </header>
  <div class="home-grid">${ids.map((id, i) => card(id, cards[i])).join('')}</div>
  <footer class="home-fine">
    <p>${t('credits')}</p>
    <p>${t('disclaimer')}</p>
  </footer>
</main>`;
app.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
ids.forEach((id, i) => drawThumb(app.querySelector(`[data-thumb="${id}"]`), cards[i].map));

function card(id, c) {
  const R = RESORTS[id], s = c.stats;
  const total = DIFF.reduce((n, [k]) => n + s.km[k], 0) || 1;
  return `<a class="resort-card" href="?resort=${id}">
    <div class="thumb"><canvas data-thumb="${id}" width="${c.map.w}" height="${c.map.h}" aria-label="${t('thumbLabel', { name: R.title })}"></canvas>${id === last ? `<span class="badge">${t('lastVisited')}</span>` : ''}</div>
    <div class="resort-body">
      <div class="resort-name"><h2>${R.title}</h2><span>${pick(R.region)}</span></div>
      <dl class="stats">
        <div><dt>${t('statPistes')}</dt><dd>${s.pistes}<small>${t('statPistesUnit')}</small></dd></div>
        <div><dt>${t('statLifts')}</dt><dd>${s.lifts}<small>${t('statLiftsUnit')}</small></dd></div>
        <div><dt>${t('statAlt')}</dt><dd>${s.low}–${s.high}<small>m</small></dd></div>
      </dl>
      <div class="mix" role="img" aria-label="${DIFF.map(([k, n]) => `${t('diff_' + k)} ${s.km[k]} km`).join(', ')}">
        ${DIFF.map(([k]) => `<i style="flex:${s.km[k]};background:${pal.trail[k]}"></i>`).join('')}
      </div>
      <div class="mix-legend">${DIFF.map(([k, n]) => `<span><i class="dot" style="background:${pal.trail[k]}"></i>${n} ${Math.round(s.km[k] / total * 100)}%</span>`).join('')}</div>
      <p class="resort-note">${cap(t(R.note))} · ${t('dataAsOf', { date: c.osmSnapshotAt?.slice(0, 10) })}</p>
      <span class="go">${t('go')}</span>
    </div>
  </a>`;
}

// Hillshade bands as pixels, then pistes and lifts as 1-pixel lines on top.
function drawThumb(canvas, m) {
  const g = canvas.getContext('2d'), img = g.createImageData(m.w, m.h), d = img.data;
  const snow = pal.snow.map(hex);
  for (let i = 0; i < m.w * m.h; i++) d.set([...snow[+m.shade[i]], 255], i * 4);
  const plot = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
    d.set([...rgb, 255], (y * m.w + x) * 4);
  };
  const line = (x0, y0, x1, y1, rgb) => {
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 1000; n++) {
      plot(x0, y0, rgb);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  // Runs are listed after connections, and harder runs go last so they stay visible where pistes overlap.
  const rank = { connection: 0, unknown: 1, green: 2, blue: 3, red: 4, black: 5 };
  for (const [diff, p] of [...m.trails].sort((a, b) => rank[a[0]] - rank[b[0]])) {
    const rgb = hex(pal.trail[diff] || pal.trail.unknown);
    for (let i = 2; i < p.length; i += 2) line(p[i - 2], p[i - 1], p[i], p[i + 1], rgb);
  }
  const ink = hex(pal.lift);
  for (const [x0, y0, x1, y1] of m.lifts) line(x0, y0, x1, y1, ink);
  g.putImageData(img, 0, 0);
}
