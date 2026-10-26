import resort from '../data/resort.json';
import scenery from '../data/scenery.json';
import { prepareRoute, roundCorners, sampleRoute, heightAt, clamp, buildPisteIndex, nearestPiste, createSkier, stepSkier } from './core.js';
import { PALETTES } from './palettes.js';
import { buildSprites } from './sprites.js';
import { makeFrame, makeGeometry, drawMasks, GroundTiles, bakeOverview, placeEntities, TILE_M, TILE_MPP } from './world.js';
import './style.css';

const DIFF = { green: '绿道', blue: '蓝道', red: '红道', black: '黑道', connection: '连接道', unknown: '未标难度' };
const trails = resort.trails.map(t => prepareRoute({ ...t, points: roundCorners(t.points, t.width) }, false, false));
const byId = Object.fromEntries(trails.map(t => [t.id, t]));
// Unnamed pistes show only their colour; hand-drawn ones carry an 'estimated' note.
const label = r => r.name || (r.kind === 'connection' ? '连接道' : DIFF[r.difficulty]);
const EST = '位置为估计（按官方地图手画）';
const lifts = resort.lifts.map(l => prepareRoute(l, true));
const pisteIndex = buildPisteIndex(trails);
const plazas = resort.plazas.map(p => ({ ...p, lift: lifts.find(l => l.id === p.lift) }));
const frame = makeFrame(resort.terrain);

// ---------- DOM ----------
const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="view"></canvas>
  <canvas id="minimap"></canvas>
  <div class="hud" id="hud" hidden></div>
  <div class="palettes" id="palettes"></div>
  <div class="prompt" id="prompt" hidden></div>
  <div class="panel" id="panel"></div>
  <div class="hints">不按键 = 顺着雪道滑 · 方向键 = 想往屏幕哪边滑（会慢慢转过去）· 空格 刹车 · Shift 快进 · 滑进缆车站会问要不要上车（回车 上 / Esc 不上）· Esc 菜单 · 1/2/3 画风</div>`;
const view = document.getElementById('view'), vctx = view.getContext('2d');
const mini = document.getElementById('minimap'), mctx = mini.getContext('2d');
const low = document.createElement('canvas'), lctx = low.getContext('2d');
const $ = id => document.getElementById(id);

// ---------- Palette-dependent assets ----------
let geo, masks, tiles, pal, sprites, entities, miniBase;
function setPalette(key) {
  pal = PALETTES[key]; state.palette = key;
  document.documentElement.style.setProperty('--ui', pal.ui);
  document.documentElement.style.setProperty('--ink', pal.uiInk);
  document.documentElement.style.setProperty('--accent', pal.uiAccent);
  document.documentElement.style.setProperty('--bg', pal.bg);
  geo ||= makeGeometry(trails, scenery, resort.pisteAreas, resort.plazas, resort.domain, resort.aprons);
  masks ||= drawMasks(frame, geo);
  tiles ||= new GroundTiles(resort.terrain, geo, frame, masks);
  tiles.setPalette(pal);
  sprites = buildSprites(pal);
  entities ||= placeEntities(frame, trails, lifts, scenery, masks);
  miniBase = bakeMinimap();
  $('palettes').innerHTML = Object.entries(PALETTES).map(([k, p], i) =>
    `<button data-pal="${k}" class="${k === key ? 'on' : ''}">${i + 1} ${p.label}</button>`).join('');
}

function bakeMinimap() {
  const w = 240, h = Math.round(w * frame.h / frame.w), k = w / frame.w;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(bakeOverview(frame, resort.terrain, geo, pal, w), 0, 0, w, h);
  const line = (pts, color, width, dash = []) => {
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath();
    pts.forEach((p, i) => { const [x, y] = frame.toPx(p[0], p[1]); i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k); });
    g.stroke();
  };
  for (const t of trails) line(t.points, pal.trail[t.difficulty], 1.4);
  for (const l of lifts) line(l.points, pal.lift, 1, [2, 2]);
  return c;
}

// ---------- Game state ----------
const state = { mode: 'menu', palette: 'warm', angle: 0, skier: null, here: null, lift: null, liftD: 0, t: 0, cam: null, pose: 'skier', liftCooldown: 0 };
const keys = new Set();
// Time scale chosen in the menu (1–3× real time), remembered per browser. Shift fast-forwards on top.
const SCALE = { min: 1, max: 3, step: .1, shift: 3 };
const loadScale = () => { try { const v = +localStorage.getItem('ski2d.timeScale'); return v >= SCALE.min && v <= SCALE.max ? v : 1; } catch { return 1; } };
state.timeScale = loadScale();
// Chairlifts run at 3× their real ~5 m/s even at 1× so rides stay short.
const LIFT_SPEED = 15;
// Ski within this many metres of a lift's bottom station to board it.
const LIFT_BOARD_RADIUS = 25;
// After saying "no" to a lift, it asks again only once the skier has moved this far away.
const LIFT_ASK_RESET = 40;

function chip(diff) { return `<i class="dot" style="background:${pal.trail[diff] || pal.lift}"></i>`; }

function startAt(route, d = 3) {
  const { position: p, tangent } = sampleRoute(route, d);
  state.skier = createSkier(p[0], p[1], Math.atan2(tangent[1], tangent[0]));
  state.skier.speed = 3;
  state.mode = 'ski'; state.lift = null; state.liftCooldown = state.t + 2; state.resumeMode = null;
  $('panel').innerHTML = ''; $('hud').hidden = false;
}

// Opening the menu mid-run pauses it; resume() carries on from the same spot and speed.
function resume() {
  if (!state.resumeMode) return;
  state.mode = state.resumeMode; state.resumeMode = null;
  $('panel').innerHTML = ''; $('hud').hidden = false;
}

function showMenu() {
  if (state.mode === 'ski' || state.mode === 'lift') state.resumeMode = state.mode;
  state.mode = 'menu'; $('hud').hidden = true; $('prompt').hidden = true;
  const seen = new Set();
  const order = { green: 0, blue: 1, red: 2, black: 3, unknown: 4 };
  const list = trails.filter(r => r.kind === 'run' && r.name && r.length > 200)
    .sort((a, b) => b.length - a.length).filter(r => !seen.has(r.name) && seen.add(r.name))
    .sort((a, b) => order[a.difficulty] - order[b.difficulty] || b.points[0][2] - a.points[0][2]);
  $('panel').innerHTML = `<div class="card menu"><h1>Saint-Lary · 雪道手记</h1>
    ${state.resumeMode ? `<button data-resume class="resume">▶ 继续滑<small>回到刚才的位置（也可以按 Esc）</small></button>` : ''}
    <p>选一条雪道作为起点，之后就可以自由滑了：往哪拐就进哪条雪道，滑进缆车站会自动上缆车。镜头会一直朝向下坡，右上角的小地图永远北朝上。</p>
    <label class="scale">速度倍数 <input id="scale" type="range" min="${SCALE.min}" max="${SCALE.max}" step="${SCALE.step}" value="${state.timeScale}"> <b id="scaleOut">${state.timeScale.toFixed(1)}×</b><small>1× = 真实速度；游戏中按住 Shift 再快 ${SCALE.shift} 倍</small></label>
    <div class="list">${list.map(r => `<button data-route="${r.id}">${chip(r.difficulty)}${r.name}<small>${DIFF[r.difficulty]} · ${Math.round(r.length)} m · ${Math.round(r.points[0][2])} → ${Math.round(r.points.at(-1)[2])} m${r.estimated ? ' · ' + EST : ''}</small></button>`).join('')}</div>
    <p class="fine">雪道、缆车、树林和建筑：© OpenStreetMap contributors（ODbL），数据截至 ${resort.meta.osmSnapshotAt?.slice(0, 10)}，按官方雪道图修正。地形：Mapzen Terrain Tiles / EU-DEM。非官方、非实时，仅供熟悉地形。</p></div>`;
}

app.addEventListener('input', e => {
  if (e.target.id !== 'scale') return;
  state.timeScale = +e.target.value;
  $('scaleOut').textContent = state.timeScale.toFixed(1) + '×';
  try { localStorage.setItem('ski2d.timeScale', state.timeScale); } catch {}
});
app.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pal) setPalette(b.dataset.pal);
  else if (b.dataset.route) startAt(byId[b.dataset.route]);
  else if ('resume' in b.dataset) resume();
  else if ('board' in b.dataset) answerLift(true);
  else if ('decline' in b.dataset) answerLift(false);
  b.blur();
});
addEventListener('keydown', e => {
  keys.add(e.key);
  if (['1', '2', '3'].includes(e.key)) setPalette(Object.keys(PALETTES)[+e.key - 1]);
  if (state.mode === 'ask' && (e.key === 'Enter' || e.key === 'Escape')) { answerLift(e.key === 'Enter'); e.preventDefault(); return; }
  if (e.key === 'Escape') state.mode === 'menu' ? resume() : showMenu();
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => keys.clear());

// ---------- Lift boarding: the game pauses and asks ----------
function askLift(l) {
  state.mode = 'ask'; state.lift = l; $('prompt').hidden = true;
  const [z0, z1] = [l.points[0][2], l.points.at(-1)[2]];
  $('panel').innerHTML = `<div class="card ask"><h2>🚡 要坐 ${l.name} 上山吗？</h2>
    <p>${Math.round(z0)} m → ${Math.round(z1)} m · 爬升 ${Math.round(z1 - z0)} m · 长 ${Math.round(l.length)} m</p>
    <button data-board class="resume">上缆车<small>回车</small></button>
    <button data-decline>不上，继续滑<small>Esc</small></button></div>`;
}
function answerLift(yes) {
  if (state.mode !== 'ask') return;
  $('panel').innerHTML = '';
  if (yes) { state.mode = 'lift'; state.liftD = 0; }
  else { state.mode = 'ski'; state.declined = state.lift; state.lift = null; }
}

// ---------- Simulation ----------
const toPx = p => frame.toPx(p[0], p[1]);
function headingAngle(a, b) { // angle that maps world vector a→b to screen-down
  const [ax, ay] = toPx(a), [bx, by] = toPx(b);
  if (Math.hypot(bx - ax, by - ay) < 1) return null;
  return Math.PI / 2 - Math.atan2(by - ay, bx - ax);
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

const T = resort.terrain;
const bounds = { x0: T.minX + 20, y0: T.minY + 20, x1: T.minX + (T.cols - 1) * T.stepX - 20, y1: T.minY + (T.rows - 1) * T.stepY - 20 };
const plazaAt = (x, y) => plazas.find(p => Math.hypot(p.x - x, p.y - y) < p.r);
const env = {
  gradient: (x, y) => [(heightAt(T, x + 20, y) - heightAt(T, x - 20, y)) / 40, (heightAt(T, x, y + 20) - heightAt(T, x, y - 20)) / 40],
  surface(x, y) {
    const [px, py] = frame.toPx(x, y), o = (Math.floor(py) * frame.w + Math.floor(px)) * 4;
    if (masks[o + 1] > 120) return plazaAt(x, y) ? 'plaza' : 'piste';
    return masks[o + 2] > 120 ? 'forest' : 'snow';
  },
  guide: (x, y) => nearestPiste(pisteIndex, x, y),
  blocked(x, y) {
    const [px, py] = frame.toPx(x, y);
    return px < 0 || py < 0 || px >= frame.w || py >= frame.h || !masks.domain[Math.floor(py) * frame.w + Math.floor(px)];
  },
};

// Arrow keys say which way on screen the player wants to go (diagonals allowed); null = hands-off.
function dirFromKeys() {
  const sx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const sy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
  if (!sx && !sy) return null;
  const a = state.angle, px = sx * Math.cos(a) + sy * Math.sin(a), py = -sx * Math.sin(a) + sy * Math.cos(a);
  return Math.atan2(-py, px); // ground pixels have y pointing south; world y points north
}

function update(dt) {
  // Run the simulation faster than real time by stepping it in equal sub-steps.
  const scale = state.timeScale * (keys.has('Shift') ? SCALE.shift : 1);
  const steps = Math.ceil(scale), sdt = dt * scale / steps;
  state.t += dt;
  let target = null, anchor = .38;
  if (state.mode === 'ski') {
    const sk = state.skier;
    const input = { dir: dirFromKeys(), brake: keys.has(' ') };
    for (let i = 0; i < steps; i++) stepSkier(sk, input, env, sdt);
    sk.x = clamp(sk.x, bounds.x0, bounds.x1); sk.y = clamp(sk.y, bounds.y0, bounds.y1);
    const alt = heightAt(T, sk.x, sk.y);
    state.target = [sk.x, sk.y]; state.alt = alt;
    // Lean the sprite toward the side of the screen the skier is heading to.
    const screenX = Math.cos(sk.heading) * Math.cos(state.angle) - (-Math.sin(sk.heading)) * Math.sin(state.angle);
    state.pose = screenX < -.3 ? 'skierL' : screenX > .3 ? 'skierR' : 'skier';
    const g = env.guide(sk.x, sk.y);
    state.here = g && g.dist < g.width / 2 + 3 ? g : null;
    state.plaza = plazaAt(sk.x, sk.y);
    // Camera faces down the nearby piste; off-piste it follows the fall line.
    if (g && g.dist < g.width / 2 + 40) target = headingAngle(sampleRoute(g.route, g.d).position, sampleRoute(g.route, g.d + 120).position);
    else { const [gx, gy] = env.gradient(sk.x, sk.y); if (Math.hypot(gx, gy) > .04) target = headingAngle([sk.x, sk.y], [sk.x - gx * 100, sk.y - gy * 100]); }
    // Lifts: ski into the bottom station to board.
    state.nearLift = null;
    for (const l of lifts) {
      const dist = Math.hypot(l.points[0][0] - sk.x, l.points[0][1] - sk.y);
      if (dist < 60 && (!state.nearLift || dist < state.nearLift.dist)) state.nearLift = { lift: l, dist };
      if (state.declined === l && dist > LIFT_ASK_RESET) state.declined = null;
      if (dist < LIFT_BOARD_RADIUS && state.t > state.liftCooldown && state.declined !== l) { askLift(l); break; }
    }
  } else if (state.mode === 'lift') {
    const l = state.lift;
    state.liftD = Math.min(l.length, state.liftD + LIFT_SPEED * scale * dt);
    const p = sampleRoute(l, state.liftD).position;
    state.target = [p[0], p[1]]; state.alt = p[2]; anchor = .62;
    target = headingAngle(sampleRoute(l, state.liftD + 120).position, sampleRoute(l, state.liftD).position);
    if (state.liftD >= l.length) {
      // Step off at the top, facing downhill, a few metres away from the station.
      const top = l.points.at(-1), [gx, gy] = env.gradient(top[0], top[1]), gl = Math.hypot(gx, gy) || 1;
      const dir = Math.hypot(gx, gy) > .02 ? [-gx / gl, -gy / gl] : (({ tangent: t }) => t)(sampleRoute(l, l.length));
      state.skier = createSkier(top[0] + dir[0] * 12, top[1] + dir[1] * 12, Math.atan2(dir[1], dir[0]));
      state.mode = 'ski'; state.lift = null; state.liftCooldown = state.t + 4;
    }
  } else if (state.mode === 'menu' && !state.target) {
    const base = lifts.find(l => l.name === 'Bouleaux') || lifts[0];
    state.target = base.points[0].slice(0, 2);
  }
  // The idle menu slowly turns the view; a paused run keeps its camera still.
  if (state.mode === 'menu' && !state.resumeMode) state.angle += dt * .06;
  else if (target !== null) state.angle += wrap(target - state.angle) * (1 - Math.exp(-dt * 1.1));
  state.cam ||= [...state.target];
  const k = 1 - Math.exp(-dt * 10);
  state.cam = [state.cam[0] + (state.target[0] - state.cam[0]) * k, state.cam[1] + (state.target[1] - state.cam[1]) * k];
  state.anchor = (state.anchor ?? anchor) + (anchor - (state.anchor ?? anchor)) * k * .3;
  // Zoom (metres per screen pixel): close when slow, pulled back when fast so the next junction shows.
  const want = state.mode === 'ask' ? state.mpp ?? 1 : state.mode === 'menu' ? (state.resumeMode ? state.mpp ?? 1 : 1.6) : state.mode === 'lift' ? 1.2 : ZOOM.near + (ZOOM.far - ZOOM.near) * clamp((state.skier?.speed ?? 0) / ZOOM.atSpeed, 0, 1);
  state.mpp = (state.mpp ?? want) + (want - (state.mpp ?? want)) * (1 - Math.exp(-dt * 1.5));
}

// ---------- Rendering ----------
let S = 3, W = 320, H = 200, dpr = 1;
function resize() {
  dpr = devicePixelRatio || 1;
  S = Math.max(2, Math.round(innerHeight / 220));
  W = Math.ceil(innerWidth / S); H = Math.ceil(innerHeight / S);
  if (!W || !H) return;
  low.width = W; low.height = H;
  view.width = Math.round(innerWidth * dpr); view.height = Math.round(innerHeight * dpr);
  view.style.width = innerWidth + 'px'; view.style.height = innerHeight + 'px';
}
addEventListener('resize', resize);

function pixelLine(g, x0, y0, x1, y1) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  while (n++ < 2000) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const CABLE = 14;
// Screen scale: metres per low-res pixel. Sprites keep their pixel size; only the world zooms.
const ZOOM = { near: TILE_MPP, far: 1, atSpeed: 14 };
// Most new ground tiles baked per frame; the rest wait a frame or two.
const TILE_BUDGET = 6;
function render() {
  if (!W || !H) return; // window has no size (hidden or minimised)
  const g = lctx, a = state.angle, cos = Math.cos(a), sin = Math.sin(a);
  const [cx, cy] = state.cam, ax = Math.round(W / 2), ay = Math.round(H * state.anchor), mpp = state.mpp, k = 1 / mpp;
  // World metres → low-res screen pixels (screen y points south before rotation).
  const proj = (x, y) => { const dx = (x - cx) * k, dy = (cy - y) * k; return [Math.round(ax + dx * cos - dy * sin), Math.round(ay + dx * sin + dy * cos)]; };
  g.imageSmoothingEnabled = false;
  g.fillStyle = pal.bg; g.fillRect(0, 0, W, H);

  // Ground tiles covering the (rotated) screen.
  const R = Math.hypot(W, H) * mpp;
  const tx0 = Math.floor((cx - R) / TILE_M), tx1 = Math.floor((cx + R) / TILE_M);
  const ty0 = Math.ceil((cy - R) / TILE_M), ty1 = Math.ceil((cy + R) / TILE_M);
  let budget = TILE_BUDGET;
  const visible = [];
  for (let ty = ty1; ty >= ty0; ty--) for (let tx = tx0; tx <= tx1; tx++) {
    const mx = (tx + .5) * TILE_M - cx, my = (ty - .5) * TILE_M - cy;
    if (Math.hypot(mx, my) > R + TILE_M) continue;
    visible.push([tx, ty, Math.hypot(mx, my)]);
  }
  visible.sort((p, q) => p[2] - q[2]);
  g.save(); g.translate(ax, ay); g.rotate(a); g.scale(k, k);
  for (const [tx, ty] of visible) {
    if (!tiles.has(tx, ty) && budget-- <= 0) continue;
    const t = tiles.get(tx, ty);
    if (t.canvas) g.drawImage(t.canvas, tx * TILE_M - cx, cy - ty * TILE_M, TILE_M + mpp, TILE_M + mpp);
  }
  g.restore();

  const draw = [], labels = [];
  const onScreen = it => { const [sx, sy] = proj(it.x, it.y); if (sx >= -30 && sx <= W + 30 && sy >= -10 && sy <= H + 40) draw.push({ sx, sy, it }); };
  for (const it of entities.near(cx, cy, R)) onScreen(it);
  for (const [tx, ty] of visible) for (const tree of tiles.trees(tx, ty)) onScreen(tree);
  // The skier, standing on the ground or hanging from the cable.
  const [kx, ky] = proj(...state.target);
  if (state.mode === 'ski') draw.push({ sx: kx, sy: ky, it: { kind: state.pose, shadow: 'shadowBig' } });
  draw.sort((p, q) => (p.z ?? p.sy) - (q.z ?? q.sy));
  for (const { sx, sy, it } of draw) {
    const spr = sprites[it.kind];
    if (it.kind.startsWith('pine') || it.shadow) { const sh = sprites[it.shadow || (it.kind === 'pine' ? 'shadowBig' : 'shadowSmall')]; g.drawImage(sh, sx - (sh.width >> 1), sy - 2); }
    if (spr) g.drawImage(spr, sx - (spr.width >> 1), sy - spr.height + 1);
    if (it.label && Math.hypot(sx - kx, sy - ky) < 95) labels.push({ x: sx, y: sy - (spr ? spr.height : 0) - 2, text: it.label, color: it.labelColor, hot: it.signFor && state.here?.route.id === it.signFor });
  }

  // Lift cables float above the trees: drawn last, through pylon tops.
  g.fillStyle = pal.lift;
  for (const l of lifts) {
    const pts = l.points.map(p => { const [x, y] = proj(p[0], p[1]); return [x, y - CABLE]; });
    if (pts.every(([x, y]) => x < -50 || x > W + 50 || y < -50 || y > H + 50) && !(state.lift === l)) continue;
    for (let i = 1; i < pts.length; i++) pixelLine(g, ...pts[i - 1], ...pts[i]);
    for (let d = (state.t * 15) % 70; d < l.length; d += 70) {
      if (state.lift === l && Math.abs(d - state.liftD) < 20) continue;
      const p = sampleRoute(l, d).position, [x, y] = proj(p[0], p[1]);
      g.drawImage(sprites.chair, x - 3, y - CABLE);
    }
  }
  if (state.mode === 'lift') { g.drawImage(sprites.chair, kx - 3, ky - CABLE); g.drawImage(sprites.skier, kx - 6, ky - CABLE - 9); }

  // Upscale crisply, then draw labels and compass at full resolution.
  vctx.imageSmoothingEnabled = false;
  vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.drawImage(low, 0, 0, W * S * dpr, H * S * dpr);
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vctx.font = `600 13px "Pixelify Sans", ui-rounded, system-ui, sans-serif`;
  vctx.textAlign = 'center'; vctx.textBaseline = 'bottom';
  for (const l of labels) {
    const x = l.x * S, y = l.y * S, w = vctx.measureText(l.text).width + 12;
    vctx.fillStyle = l.hot ? pal.uiAccent : pal.ui; vctx.strokeStyle = pal.ink; vctx.lineWidth = 2;
    vctx.beginPath(); vctx.roundRect(x - w / 2, y - 20, w, 20, 6); vctx.fill(); vctx.stroke();
    if (l.color) { vctx.fillStyle = pal.trail[l.color]; vctx.fillRect(x - w / 2 + 4, y - 14, 3, 8); }
    vctx.fillStyle = l.hot ? pal.ui : pal.uiInk; vctx.fillText(l.text, x + (l.color ? 2 : 0), y - 3);
  }
  drawCompass(a);
  drawMinimap();
}

function drawCompass(a) {
  const x = 46, y = innerHeight - 70, r = 26;
  vctx.fillStyle = pal.ui; vctx.strokeStyle = pal.ink; vctx.lineWidth = 2;
  vctx.beginPath(); vctx.arc(x, y, r, 0, Math.PI * 2); vctx.fill(); vctx.stroke();
  const nx = Math.sin(a), ny = -Math.cos(a);
  vctx.fillStyle = pal.uiAccent; vctx.beginPath();
  vctx.moveTo(x + nx * (r - 6), y + ny * (r - 6)); vctx.lineTo(x - ny * 6, y + nx * 6); vctx.lineTo(x + ny * 6, y - nx * 6); vctx.fill();
  vctx.fillStyle = pal.uiInk; vctx.font = '700 12px "Pixelify Sans", system-ui'; vctx.textBaseline = 'middle';
  vctx.fillText('N', x + nx * (r + 9), y + ny * (r + 9));
}

function drawMinimap() {
  const w = miniBase.width, h = miniBase.height, k = w / frame.w;
  if (mini.width !== w * dpr) { mini.width = w * dpr; mini.height = h * dpr; mini.style.width = w + 'px'; mini.style.height = h + 'px'; }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.drawImage(miniBase, 0, 0);
  const active = state.mode === 'lift' ? state.lift : state.mode === 'menu' ? null : state.here?.route;
  if (active) {
    mctx.strokeStyle = pal.ink; mctx.lineWidth = 4; mctx.setLineDash([]); mctx.beginPath();
    active.points.forEach((p, i) => { const [x, y] = toPx(p); i ? mctx.lineTo(x * k, y * k) : mctx.moveTo(x * k, y * k); }); mctx.stroke();
    mctx.strokeStyle = pal.trail[active.difficulty] || pal.ui; mctx.lineWidth = 2; mctx.stroke();
  }
  const [x, y] = frame.toPx(...state.target);
  // A wedge pointing to screen-down (downhill) so the map and the view can be matched up.
  const dx = -Math.sin(state.angle), dy = Math.cos(state.angle);
  mctx.fillStyle = pal.uiAccent; mctx.strokeStyle = pal.ui; mctx.lineWidth = 1.5;
  mctx.beginPath(); mctx.moveTo(x * k + dx * 9, y * k + dy * 9); mctx.lineTo(x * k - dy * 4, y * k + dx * 4); mctx.lineTo(x * k + dy * 4, y * k - dx * 4); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.fillStyle = pal.ink; mctx.font = '700 11px "Pixelify Sans", system-ui'; mctx.fillText('N ↑', 8, 14);
}

function updateHud() {
  const prompt = $('prompt');
  if (state.mode === 'ski') {
    const sk = state.skier, r = state.here?.route;
    const where = state.plaza ? `<b>🚡 ${state.plaza.lift.name} ${state.plaza.end === 'top' ? '顶站' : '底站'}</b><span>缆车站广场 · 按方向键蹬向想去的雪道入口</span>`
      : r ? `<b>${chip(r.difficulty)}${label(r)}</b><span>${DIFF[r.difficulty]}${r.estimated ? ' · ' + EST : ''}</span>`
      : `<b>${sk.surface === 'forest' ? '🌲 树林里' : '❄️ 雪道外'}</b><span>深雪会减速，回到雪道上吧</span>`;
    const x = state.timeScale * (keys.has('Shift') ? SCALE.shift : 1);
    $('hud').innerHTML = `${where}<span>${Math.round(sk.speed * 3.6)} km/h${x > 1.05 ? ` · 画面 ×${x.toFixed(1)}` : ''} · 海拔 ${Math.round(state.alt)} m</span>`;
    const nl = state.nearLift;
    prompt.hidden = !nl;
    if (nl) prompt.innerHTML = `前方 🚡 <b>${nl.lift.name}</b> 缆车 · 滑进站台会问你要不要上`;
  } else if (state.mode === 'lift') {
    $('hud').innerHTML = `<b>🚡 ${state.lift.name}</b><span>海拔 ${Math.round(state.alt)} m · 按住 Shift 快进</span><div class="bar"><i style="width:${(state.liftD / state.lift.length * 100).toFixed(1)}%"></i></div>`;
    prompt.hidden = true;
  } else prompt.hidden = true;
}

// ---------- Boot ----------
resize();
setPalette('warm');
showMenu();
let last = performance.now();
let loggedError = false;
function frameLoop(now) {
  // Schedule first: one bad frame must not stop the game.
  requestAnimationFrame(frameLoop);
  const dt = clamp((now - last) / 1000, 0, .05); last = now;
  try { update(dt); render(); updateHud(); }
  catch (err) { if (!loggedError) { console.error(err); loggedError = true; } }
}
requestAnimationFrame(frameLoop);
// Debug hooks for automated screenshots.
window.__ski = { state, trails, lifts, startAt, setPalette, showMenu, update, render, keys };
