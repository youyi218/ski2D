import { seededRandom, sampleRoute, widthAt, widthIntervals, subPolyline } from './core.js';

// Physics, trees and the minimap use one whole-map mask at RES metres per pixel.
export const RES = 2;
// The visible ground is baked lazily in square tiles: TILE pixels at TILE_MPP metres per pixel.
export const TILE = 256, TILE_MPP = .5;
export const TILE_M = TILE * TILE_MPP;
// Skiable margin (m) kept around every piste and plaza, beyond the OSM domain outline.
const DOMAIN_MARGIN = 30;
// Edge band drawn around pistes, metres per side.
const EDGE_M = 3;
// Trees inside OSM forests: one candidate every TREE_SPACING metres, jittered.
const TREE_SPACING = 8;
// Tile cache limits: baked ground images kept, and total entries (tree lists are cheap to redo).
const MAX_BAKED = 300, MAX_ENTRIES = 3000;
// A tile used within this many ms is never evicted (it is on screen right now).
const KEEP_MS = 2000;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - .47);

export function makeFrame(terrain) {
  const minX = terrain.minX, maxY = terrain.minY + (terrain.rows - 1) * terrain.stepY;
  const w = Math.round((terrain.cols - 1) * terrain.stepX / RES), h = Math.round((terrain.rows - 1) * terrain.stepY / RES);
  return { w, h, minX, maxY, toPx: (x, y) => [(x - minX) / RES, (maxY - y) / RES], toWorld: (px, py) => [minX + px * RES, maxY - py * RES] };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

const bboxOf = pts => pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const hits = (b, x0, y0, x1, y1, pad) => b[2] + pad >= x0 && b[0] - pad <= x1 && b[3] + pad >= y0 && b[1] - pad <= y1;

// Everything the mask painter needs, with bounding boxes so a tile only draws what touches it.
export function makeGeometry(routes, scenery, pisteAreas = [], plazas = [], domain = [], aprons = []) {
  return {
    routes: routes.map(r => ({ r, box: bboxOf(r.points), pieces: widthIntervals(r).map(i => ({ ...i, pts: subPolyline(r, i.d0, i.d1) })) })),
    forests: scenery.forests.map(rings => ({ rings, box: bboxOf(rings.flat()) })),
    pisteAreas: pisteAreas.map(a => ({ a, box: bboxOf(a) })),
    plazas, domain,
    // Round patches of piste: plazas plus the aprons that soften sharp bends and forks.
    discs: [...plazas, ...aprons],
  };
}

// region = { x0 (west, m), y1 (north, m), mpp (m per px), w, h }.
// Returns RGBA bytes: R = piste edge band, G = piste body (incl. plazas), B = forest.
export function drawMaskRegion(region, geo) {
  const { x0, y1, mpp, w, h } = region, x1 = x0 + w * mpp, y0 = y1 - h * mpp;
  const P = (p) => [(p[0] - x0) / mpp, (y1 - p[1]) / mpp];
  const trace = (g, pts, close) => { pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); };
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = '#0000ff';
  // Each forest is a list of rings (outer + inner); even-odd fill punches the clearings out.
  for (const f of geo.forests) if (hits(f.box, x0, y0, x1, y1, 0)) { g.beginPath(); for (const ring of f.rings) trace(g, ring, true); g.fill('evenodd'); }
  const layer = (extraM, color) => {
    const l = document.createElement('canvas'); l.width = w; l.height = h;
    const lg = l.getContext('2d'); lg.lineCap = lg.lineJoin = 'round'; lg.strokeStyle = lg.fillStyle = color;
    for (const { box, pieces } of geo.routes) {
      if (!hits(box, x0, y0, x1, y1, 120)) continue;
      for (const { width, pts } of pieces) { lg.lineWidth = (width + extraM * 2) / mpp; lg.beginPath(); trace(lg, pts); lg.stroke(); }
    }
    lg.lineWidth = extraM * 2 / mpp;
    for (const { a, box } of geo.pisteAreas) if (hits(box, x0, y0, x1, y1, 10)) { lg.beginPath(); trace(lg, a, true); lg.fill(); if (extraM) lg.stroke(); }
    for (const pl of geo.discs) if (hits([pl.x, pl.y, pl.x, pl.y], x0, y0, x1, y1, pl.r + 10)) { const [x, y] = P([pl.x, pl.y]); lg.beginPath(); lg.arc(x, y, (pl.r + extraM) / mpp, 0, Math.PI * 2); lg.fill(); }
    g.drawImage(l, 0, 0);
  };
  layer(EDGE_M, '#ff0000');
  layer(0, '#00ff00');
  return g.getImageData(0, 0, w, h).data;
}

// Whole-map masks at RES for physics and tree placement, plus the skiable domain.
export function drawMasks(frame, geo) {
  const region = { x0: frame.minX, y1: frame.maxY, mpp: RES, w: frame.w, h: frame.h };
  const data = drawMaskRegion(region, geo);
  // Where the skier may go: the ski domain outline ∪ a margin around pistes and plazas.
  const dc = document.createElement('canvas'); dc.width = frame.w; dc.height = frame.h;
  const dg = dc.getContext('2d'); dg.fillStyle = dg.strokeStyle = '#fff'; dg.lineCap = dg.lineJoin = 'round';
  const trace = pts => pts.forEach((p, i) => { const [x, y] = frame.toPx(p[0], p[1]); i ? dg.lineTo(x, y) : dg.moveTo(x, y); });
  for (const ring of geo.domain) { dg.beginPath(); trace(ring); dg.closePath(); dg.fill(); }
  for (const { r } of geo.routes) { dg.lineWidth = ((r.width ?? 45) + DOMAIN_MARGIN * 2) / RES; dg.beginPath(); trace(r.points); dg.stroke(); }
  for (const pl of geo.plazas) { const [x, y] = frame.toPx(pl.x, pl.y); dg.beginPath(); dg.arc(x, y, (pl.r + DOMAIN_MARGIN) / RES, 0, Math.PI * 2); dg.fill(); }
  const dd = dg.getImageData(0, 0, frame.w, frame.h).data;
  data.domain = new Uint8Array(frame.w * frame.h);
  for (let i = 0; i < data.domain.length; i++) data.domain[i] = dd[i * 4 + 3] > 120 ? 1 : 0;
  return data;
}

// Hillshade per DEM vertex (bilinear per pixel later): smooth light, posterised into palette bands.
export function makeShade(t) {
  const shade = new Float32Array(t.cols * t.rows), slope = new Float32Array(t.cols * t.rows);
  const H = (i, j) => t.heights[Math.max(0, Math.min(t.rows - 1, j)) * t.cols + Math.max(0, Math.min(t.cols - 1, i))];
  const L = [-.55, .55, .63], ll = Math.hypot(...L);
  for (let j = 0; j < t.rows; j++) for (let i = 0; i < t.cols; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * t.stepX), dy = (H(i, j + 1) - H(i, j - 1)) / (2 * t.stepY);
    const n = [-dx * 1.6, -dy * 1.6, 1], nl = Math.hypot(...n);
    shade[j * t.cols + i] = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl / ll;
    slope[j * t.cols + i] = Math.hypot(dx, dy);
  }
  const sorted = [...shade].sort((a, b) => a - b);
  return { shade, slope, lo: sorted[Math.floor(sorted.length * .03)], hi: sorted[Math.floor(sorted.length * .97)] };
}

// Paint one region of ground. Dither uses absolute pixel coordinates so tiles join seamlessly.
export function bakeRegion(region, terrain, sh, masks, pal) {
  const { x0, y1, mpp, w, h } = region;
  const ramp = name => pal[name].map(hexToRgb);
  const snow = ramp('snow'), groomed = ramp('groomed'), forest = ramp('forestFloor'), rock = ramp('rock');
  const contour = hexToRgb(pal.contour);
  const img = new ImageData(w, h), d = img.data;
  const { cols, rows, stepX, stepY, minX, minY, heights: H } = terrain;
  const { shade, slope, lo, hi } = sh;
  const ox = Math.round(x0 / mpp), oy = Math.round(-y1 / mpp);
  const prevRow = new Float32Array(w);
  const heightAtPx = (px, py) => {
    const gx = Math.min(cols - 1.001, Math.max(0, (x0 + px * mpp - minX) / stepX)), gy = Math.min(rows - 1.001, Math.max(0, (y1 - py * mpp - minY) / stepY));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, k = j * cols + i;
    return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fy) + (H[k + cols] * (1 - fx) + H[k + cols + 1] * fx) * fy;
  };
  for (let px = 0; px < w; px++) prevRow[px] = heightAtPx(px, -1);
  for (let py = 0; py < h; py++) {
    const gy = Math.min(rows - 1.001, Math.max(0, (y1 - py * mpp - minY) / stepY));
    const j = Math.floor(gy), fy = gy - j;
    let prevH = heightAtPx(-1, py);
    for (let px = 0; px < w; px++) {
      const gx = Math.min(cols - 1.001, Math.max(0, (x0 + px * mpp - minX) / stepX));
      const i = Math.floor(gx), fx = gx - i, k = j * cols + i;
      const bil = a => (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fy) + (a[k + cols] * (1 - fx) + a[k + cols + 1] * fx) * fy;
      const s = (bil(shade) - lo) / (hi - lo), hgt = bil(H), sl = bil(slope);
      const o = (py * w + px) * 4;
      const dither = BAYER[((py + oy) & 3) * 4 + ((px + ox) & 3)] * .9;
      const band = Math.max(0, Math.min(4, Math.floor((1 - s) * 5 + dither)));
      let col;
      if (masks[o + 1] > 120) col = groomed[band];
      else if (masks[o] > 120) col = snow[Math.min(4, band + 2)];
      else if (sl > .95 + dither * .15) col = rock[Math.min(2, band >> 1)];
      else if (masks[o + 2] > 120) col = forest[band];
      else col = snow[band];
      // Contour every 50 m, skipped on pistes so they read as clean ribbons.
      const step = Math.floor(hgt / 50);
      if (masks[o + 1] <= 120 && (step !== Math.floor(prevH / 50) || step !== Math.floor(prevRow[px] / 50)) && band < 4) col = contour.map((v, n) => (v + col[n]) / 2);
      prevRow[px] = hgt; prevH = hgt;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// Ground tiles + their trees, baked on first use. Tile (tx, ty) covers x ∈ [tx, tx+1)·TILE_M and
// y ∈ (ty-1, ty]·TILE_M (ty counts northward; the tile's top edge is y = ty·TILE_M).
export class GroundTiles {
  constructor(terrain, geo, frame, masks2m) {
    this.terrain = terrain; this.geo = geo; this.frame = frame; this.masks2m = masks2m;
    this.shade = makeShade(terrain); this.cache = new Map(); this.pal = null;
  }
  setPalette(pal) { this.pal = pal; for (const t of this.cache.values()) t.canvas = null; }
  has(tx, ty) { return !!this.cache.get(tx + ',' + ty)?.canvas; }
  #entry(tx, ty) {
    const key = tx + ',' + ty;
    let t = this.cache.get(key);
    if (!t) { t = { trees: this.#trees(tx, ty), canvas: null, masks: null, used: 0 }; this.cache.set(key, t); }
    t.used = performance.now();
    return t;
  }
  // Always returns a tile with a canvas (bakes it if needed).
  get(tx, ty) {
    const t = this.#entry(tx, ty);
    if (!t.canvas) {
      this.#evict(t.used);
      const region = { x0: tx * TILE_M, y1: ty * TILE_M, mpp: TILE_MPP, w: TILE, h: TILE };
      t.masks ||= drawMaskRegion(region, this.geo);
      t.canvas = bakeRegion(region, this.terrain, this.shade, t.masks, this.pal);
    }
    return t;
  }
  trees(tx, ty) { return this.#entry(tx, ty).trees; }
  // Drop the least recently used tiles, never one used in the last KEEP_MS (i.e. on screen).
  #evict(now) {
    const stale = t => now - t.used > KEEP_MS;
    const baked = [...this.cache.values()].filter(t => t.canvas);
    if (baked.length >= MAX_BAKED)
      for (const t of baked.filter(stale).sort((a, b) => a.used - b.used).slice(0, baked.length - MAX_BAKED + 50)) { t.canvas = null; t.masks = null; }
    if (this.cache.size > MAX_ENTRIES)
      for (const [key, t] of [...this.cache.entries()].filter(([, t]) => stale(t)).sort((a, b) => a[1].used - b[1].used).slice(0, this.cache.size - MAX_ENTRIES + 500)) this.cache.delete(key);
  }
  // Trees: jittered grid inside OSM forest outlines, kept clear of pistes (whole-map mask).
  #trees(tx, ty) {
    const { frame, masks2m } = this, out = [];
    const rand = seededRandom(((tx * 73856093) ^ (ty * 19349663)) >>> 0 || 7);
    for (let y = ty * TILE_M; y > (ty - 1) * TILE_M; y -= TREE_SPACING) for (let x = tx * TILE_M; x < (tx + 1) * TILE_M; x += TREE_SPACING) {
      const wx = x + rand() * TREE_SPACING, wy = y - rand() * TREE_SPACING, small = rand() < .35, skip = rand() < .15;
      const [px, py] = frame.toPx(wx, wy);
      if (skip || px < 0 || py < 0 || px >= frame.w || py >= frame.h) continue;
      const o = (Math.floor(py) * frame.w + Math.floor(px)) * 4;
      if (masks2m[o + 2] > 120 && masks2m[o] <= 120) out.push({ kind: small ? 'pineSmall' : 'pine', x: wx, y: wy });
    }
    return out;
  }
}

// Minimap base: the whole map baked once at a coarse resolution.
export function bakeOverview(frame, terrain, geo, pal, widthPx) {
  const mpp = frame.w * RES / widthPx;
  const region = { x0: frame.minX, y1: frame.maxY, mpp, w: widthPx, h: Math.round(frame.h * RES / mpp) };
  return bakeRegion(region, terrain, makeShade(terrain), drawMaskRegion(region, geo), pal);
}

// Fixed sprites (buildings, poles, signs, lifts, labels) in world metres, bucketed for culling.
export function placeEntities(frame, routes, lifts, scenery, masks) {
  const items = [];
  const add = (kind, x, y, extra = {}) => { const [px, py] = frame.toPx(x, y); if (px >= 0 && py >= 0 && px < frame.w && py < frame.h) items.push({ kind, x, y, ...extra }); };
  const maskAt = (px, py, ch) => masks[(Math.floor(py) * frame.w + Math.floor(px)) * 4 + ch] > 120;
  for (const b of scenery.buildings) add(b.area > 400 ? 'station' : 'chalet', b.x, b.y);
  for (const r of scenery.restaurants) add('chalet', r.x, r.y, { label: (r.kind === 'restaurant' ? '🍴 ' : '☕ ') + r.name });
  for (const r of routes) {
    if (r.kind === 'connection') continue;
    for (let d = 20; d < r.length - 10; d += 70) {
      const { position: p, tangent: t } = sampleRoute(r, d);
      const half = widthAt(r, d) / 2 + 1;
      for (const side of [-1, 1]) {
        const x = p[0] + t[1] * half * side, y = p[1] - t[0] * half * side, [px, py] = frame.toPx(x, y);
        // No poles in the middle of open snow (another piste or a station plaza).
        if (px >= 0 && py >= 0 && px < frame.w && py < frame.h && !maskAt(px, py, 1)) add('pole-' + r.difficulty, x, y);
      }
    }
    if (!r.name) continue;
    const s = sampleRoute(r, 6);
    const off = widthAt(r, 6) / 2 + 5;
    add('sign-' + r.difficulty, s.position[0] - s.tangent[1] * off, s.position[1] + s.tangent[0] * off, { label: r.name, labelColor: r.difficulty, signFor: r.id });
  }
  for (const l of lifts) {
    l.points.forEach((p, i) => add(i === 0 || i === l.points.length - 1 ? 'station' : 'pylon', p[0], p[1], i === 0 ? { label: '🚡 ' + l.name } : {}));
  }
  for (const p of scenery.peaks) add('none', p.x, p.y, { label: `▲ ${p.name}${p.ele ? ' ' + p.ele + ' m' : ''}` });
  return bucket(items);
}

const B = 128;
function bucket(items) {
  const map = new Map();
  for (const it of items) {
    const key = Math.floor(it.x / B) + ',' + Math.floor(it.y / B);
    (map.get(key) || map.set(key, []).get(key)).push(it);
  }
  return {
    count: items.length,
    near(x, y, r) {
      const res = [];
      for (let by = Math.floor((y - r) / B); by <= Math.floor((y + r) / B); by++)
        for (let bx = Math.floor((x - r) / B); bx <= Math.floor((x + r) / B); bx++) {
          const list = map.get(bx + ',' + by); if (list) res.push(...list);
        }
      return res;
    },
  };
}
