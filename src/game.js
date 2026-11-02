import { prepareRoute, roundCorners, sampleRoute, heightAt, clamp, buildPisteIndex, nearestPiste, createSkier, stepSkier, SKI, ARCADE, seededRandom, liftSpeed, DRAG_LIFTS } from './core.js';
import { PALETTES } from './palettes.js';
import { buildSprites } from './sprites.js';
import { makeFrame, makeGeometry, drawMasks, GroundTiles, bakeOverview, placeEntities, TILE_M, TILE_MPP, RES } from './world.js';
import { RESORTS, LAST_KEY, chosenResort } from './resorts.js';
import { t, langSwitch, setLang } from './i18n.js';

const resortId = chosenResort(), R = RESORTS[resortId];
document.title = `${R.title} · ${t('app')}`;
try { localStorage.setItem(LAST_KEY, resortId); } catch {}
document.querySelector('.loading p')?.replaceChildren(R.place);
const [{ default: resort }, { default: scenery }] = await R.load();

const DIFF = Object.fromEntries(['green', 'blue', 'red', 'black', 'connection', 'unknown'].map(k => [k, t('diff_' + k)]));
const trails = resort.trails.map(t => prepareRoute({ ...t, points: roundCorners(t.points, t.width) }, false, false));
const byId = Object.fromEntries(trails.map(t => [t.id, t]));
// Unnamed pistes show only their colour; hand-drawn ones carry an 'estimated' note.
const label = r => r.name || (r.kind === 'connection' ? DIFF.connection : DIFF[r.difficulty]);
const EST = t('estimated');
const lifts = resort.lifts.map(l => prepareRoute(l, true));
const pisteIndex = buildPisteIndex(trails);
const plazas = resort.plazas.map(p => ({ ...p, lift: lifts.find(l => l.id === p.lift) }));
const frame = makeFrame(resort.terrain);

// ---------- DOM ----------
const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="view"></canvas>
  <canvas id="minimap" title="${t('minimapTitle')}"></canvas>
  <div class="hud" id="hud" hidden></div>
  <div class="palettes" id="palettes"></div>
  <div class="prompt" id="prompt" hidden></div>
  <div class="panel" id="panel"></div>
  <div class="hints" id="hints"></div>
  <div class="bigmap" id="bigmap" hidden><canvas id="bigmapCanvas"></canvas>
    <div class="bigmap-bar"><b>${R.title}</b><span>${t('mapHelp')}</span><button id="mapMe">${t('mapMe')}</button><button id="mapClose">${t('mapClose')}</button></div></div>`;
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
  view3d?.dispose(); view3d = null; // rebuilt in the new colours next time it is shown
  sprites = buildSprites(pal);
  entities ||= placeEntities(frame, trails, lifts, scenery, masks);
  miniBase = bakeMinimap(); mapBase = null;
  if (big.open) drawBigMap();
  $('palettes').innerHTML = Object.entries(PALETTES).map(([k, p], i) =>
    `<button data-pal="${k}" class="${k === key ? 'on' : ''}">${i + 1} ${t(p.label)}</button>`).join('') + '<button id="mute"></button><button id="viewToggle"></button>';
  viewButton();
  sound.show();
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
const state = { mode: 'menu', palette: 'warm', angle: 0, skier: null, here: null, lift: null, liftD: 0, liftFast: true, t: 0, liftClock: 0, cam: null, pose: 'skier', liftCooldown: 0 };
// Feel: 'arcade' (default, snappy and fast) or 'real' (real-world physics), remembered per browser.
const loadFeel = () => { try { return localStorage.getItem('ski2d.feel') === 'real' ? 'real' : 'arcade'; } catch { return 'arcade'; } };
state.feel = loadFeel();
// View: '2d' (top-down map) or '3d' (over the shoulder), toggled with V and remembered per browser.
const loadView = () => { try { return localStorage.getItem('ski2d.view') === '3d' ? '3d' : '2d'; } catch { return '2d'; } };
state.view = loadView();
const physics = () => state.feel === 'arcade' ? ARCADE : SKI;
const hints = () => t('hint_' + state.feel + (state.view === '3d' ? '3d' : ''));
function setFeel(f) {
  state.feel = f;
  try { localStorage.setItem('ski2d.feel', f); } catch {}
  $('hints').textContent = hints();
  document.querySelectorAll('[data-feel]').forEach(b => b.classList.toggle('on', b.dataset.feel === f));
  const sc = document.querySelector('.scale'); if (sc) sc.hidden = f === 'arcade';
}
const keys = new Set();
// Time scale chosen in the menu (1–3× real time), remembered per browser. Shift fast-forwards on top.
const SCALE = { min: 1, max: 3, step: .1, shift: 3 };
const loadScale = () => { try { const v = +localStorage.getItem('ski2d.timeScale'); return v >= SCALE.min && v <= SCALE.max ? v : 1; } catch { return 1; } };
state.timeScale = loadScale();
// Chairlifts run at 3× their real ~5 m/s even at 1× so rides stay short (5× in arcade).
// The player's own ride, fast-forwarded (m/s along the map); Shift on the lift switches to the lift's real speed.
const LIFT_FAST = { real: 15, arcade: 25 };
// Per lift, the shift of its 2D chairs that puts one chair exactly where the player rides.
const liftPhase = new Map();
// On a drag lift the rider can drift this far either side of the line (m), at this speed (m/s).
const DRAG_SIDE = 1.8, DRAG_STEP = 1.5;
// Ski within this many metres of a lift's bottom station to board it.
const LIFT_BOARD_RADIUS = 25;

function chip(diff) { return `<i class="dot" style="background:${pal.trail[diff] || pal.lift}"></i>`; }

function startAt(route, d = 3) {
  const { position: p, tangent } = sampleRoute(route, d);
  state.skier = createSkier(p[0], p[1], Math.atan2(tangent[1], tangent[0]));
  state.skier.speed = state.feel === 'arcade' ? 6 : 3;
  trail.length = 0;
  state.mode = 'ski'; state.lift = null; state.liftCooldown = state.t + 2; state.resumeMode = null; state.radarH = null;
  view3d?.reset();
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
  $('panel').innerHTML = `<div class="card menu"><div class="menu-top"><a class="home" href="./">${t('allResorts')}</a>${langSwitch()}</div><h1>${R.title} · ${t('app')}</h1>
    <div class="resorts">${Object.entries(RESORTS).map(([id, r]) => `<a href="?resort=${id}" class="${id === resortId ? 'on' : ''}">${r.title}<small>${r.place.split(' · ')[1]}</small></a>`).join('')}</div>
    ${state.resumeMode ? `<button data-resume class="resume">${t('resume')}<small>${t('resumeSub')}</small></button>` : ''}
    <p>${t('intro')}</p>
    <div class="feel"><button data-feel="arcade" class="${state.feel === 'arcade' ? 'on' : ''}">${t('arcade')}<small>${t('arcadeSub')}</small></button><button data-feel="real" class="${state.feel === 'real' ? 'on' : ''}">${t('real')}<small>${t('realSub')}</small></button></div>
    <label class="scale" ${state.feel === 'arcade' ? 'hidden' : ''}>${t('timeScale')} <input id="scale" type="range" min="${SCALE.min}" max="${SCALE.max}" step="${SCALE.step}" value="${state.timeScale}"> <b id="scaleOut">${state.timeScale.toFixed(1)}×</b><small>${t('timeScaleSub', { n: SCALE.shift })}</small></label>
    <input id="search" class="search" type="search" placeholder="${t('search')}" autocomplete="off" spellcheck="false">
    <div class="list" id="routes"></div>
    <p class="fine">${t('fine', { date: resort.meta.osmSnapshotAt?.slice(0, 10), note: t(R.note) })}${resort.meta.sources.some(x => x.name.startsWith('IGN')) ? ' ' + t('ignCredit') : ''}</p></div>`;
  showRoutes('');
}

// ---------- Run list and search ----------
// Without a query: named runs over 200 m, easiest first. With one: every named piste, connections
// and short bits included, matched ignoring case and accents, names starting with it first.
const fold = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-'’]/g, ' ');
const ORDER = { green: 0, blue: 1, red: 2, black: 3, connection: 4, unknown: 5 };
const longestByName = list => { const seen = new Set(); return list.sort((a, b) => b.length - a.length).filter(r => !seen.has(r.name) && seen.add(r.name)); };
const defaultRoutes = longestByName(trails.filter(r => r.kind === 'run' && r.name && r.length > 200))
  .sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty] || b.points[0][2] - a.points[0][2]);
const named = longestByName(trails.filter(r => r.name)).map(r => ({ r, key: fold(r.name) }));
function findRoutes(q) {
  q = fold(q).trim(); if (!q) return defaultRoutes;
  return named.filter(n => n.key.includes(q))
    .sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || (b.key.split(' ').some(w => w.startsWith(q)) - a.key.split(' ').some(w => w.startsWith(q))) || b.r.length - a.r.length)
    .map(n => n.r);
}
function showRoutes(q) {
  const list = findRoutes(q);
  $('routes').innerHTML = list.length ? list.map(r => `<button data-route="${r.id}">${chip(r.difficulty)}${r.name}<small>${DIFF[r.difficulty]} · ${Math.round(r.length)} m · ${Math.round(r.points[0][2])} → ${Math.round(r.points.at(-1)[2])} m${r.estimated ? ' · ' + EST : ''}</small></button>`).join('')
    : `<p class="empty">${t('noMatch', { q: q.replace(/[<&]/g, '') })}</p>`;
  return list;
}

app.addEventListener('input', e => {
  if (e.target.id === 'search') { showRoutes(e.target.value); return; }
  if (e.target.id !== 'scale') return;
  state.timeScale = +e.target.value;
  $('scaleOut').textContent = state.timeScale.toFixed(1) + '×';
  try { localStorage.setItem('ski2d.timeScale', state.timeScale); } catch {}
});
app.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pal) setPalette(b.dataset.pal);
  else if (b.dataset.route) startAt(byId[b.dataset.route]);
  else if (b.dataset.feel) setFeel(b.dataset.feel);
  else if (b.dataset.lang) setLang(b.dataset.lang);
  else if (b.id === 'mute') { sound.wake(); sound.toggle(); }
  else if (b.id === 'viewToggle') setView(state.view === '3d' ? '2d' : '3d');
  else if ('resume' in b.dataset) resume();
  else if (b.id === 'mapClose') closeMap();
  else if (b.id === 'mapMe') centreMapOnMe();
  b.blur();
});
addEventListener('keydown', e => {
  // Typing in the search box: Enter starts the first match, Esc clears (or, when empty, leaves the menu).
  if (e.target.id === 'search') {
    if (e.key === 'Enter') { const [first] = findRoutes(e.target.value); if (first) { e.target.blur(); startAt(first); } }
    else if (e.key === 'Escape') { if (e.target.value) { e.target.value = ''; showRoutes(''); } else { e.target.blur(); resume(); } }
    return;
  }
  // The full map pauses the game and takes the keyboard until it closes.
  if (big.open) { if (e.key === 'Tab' || e.key === 'Escape') closeMap(); e.preventDefault(); return; }
  if (e.key === 'Tab') { openMap(); e.preventDefault(); return; }
  if (e.key === '/') { if (state.mode !== 'menu') showMenu(); $('search')?.focus(); e.preventDefault(); return; }
  keys.add(e.key);
  if (['1', '2', '3'].includes(e.key)) setPalette(Object.keys(PALETTES)[+e.key - 1]);
  sound.wake();
  if (e.key === 'm' || e.key === 'M') sound.toggle();
  if (e.key === 'Shift' && !e.repeat && state.mode === 'lift') state.liftFast = !state.liftFast;
  if (e.key === 'v' || e.key === 'V') setView(state.view === '3d' ? '2d' : '3d');
  if (e.key === 'Enter' && state.mode === 'ski' && state.canBoard) { boardLift(state.canBoard); e.preventDefault(); return; }
  if (e.key === 'Escape') state.mode === 'menu' ? resume() : showMenu();
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => keys.clear());

// ---------- Lift boarding: in the station, Enter boards; the run never pauses ----------
function boardLift(l) {
  state.mode = 'lift'; state.lift = l; state.liftD = 0; state.canBoard = null; state.liftFast = true; state.liftSide = 0;
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

const down = () => keys.has('ArrowDown') || keys.has('s'), up = () => keys.has('ArrowUp') || keys.has('w');
// Arrow keys say which way on screen the player wants to go (diagonals allowed); null = hands-off.
// Arcade, once moving: ↓ tucks and ↑ brakes instead, so only ← → steer.
// 3D: the view looks where the skier goes, so ← → turn relative to the skier, ↑ pushes off when slow
// (and tucks in arcade once moving) and ↓ brakes.
function readInput(sk) {
  const carving = state.feel === 'arcade' && sk.speed > ARCADE.pushMax;
  if (state.view === '3d') {
    const turn = (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0) - (keys.has('ArrowRight') || keys.has('d') ? 1 : 0);
    const push = up() && sk.speed < physics().pushMax, base = view3d?.facing ?? sk.heading;
    return { dir: turn ? base + turn * 1.2 : push ? base : null, brake: keys.has(' ') || down(), tuck: carving && up() };
  }
  return { dir: dirFromKeys(carving), brake: keys.has(' ') || (carving && up()), tuck: carving && down() };
}
function dirFromKeys(sideOnly) {
  const sx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const sy = sideOnly ? 0 : (down() ? 1 : 0) - (up() ? 1 : 0);
  if (!sx && !sy) return null;
  const a = state.angle, px = sx * Math.cos(a) + sy * Math.sin(a), py = -sx * Math.sin(a) + sy * Math.cos(a);
  return Math.atan2(-py, px); // ground pixels have y pointing south; world y points north
}

function update(dt) {
  // Run the simulation faster than real time by stepping it in equal sub-steps.
  // On a lift Shift is a toggle (fast / normal), not a held fast-forward.
  const base = state.feel === 'arcade' ? ARCADE.time : state.timeScale;
  const scale = base * (keys.has('Shift') && state.mode !== 'lift' ? SCALE.shift : 1);
  const steps = Math.ceil(scale), sdt = dt * scale / steps;
  state.t += dt;
  // Lift time: every lift runs at its real speed in game time; while the player rides fast, all lifts
  // fast-forward together so the player's chair keeps its place in the line.
  const riding = state.mode === 'lift' && state.lift;
  const rideSpeed = riding ? (state.liftFast ? LIFT_FAST[state.feel] : liftSpeed(riding.type)) * base : 0;
  state.liftClock += riding ? dt * rideSpeed / liftSpeed(riding.type) : dt * scale;
  let target = null, anchor = .38;
  if (state.mode === 'ski') {
    const sk = state.skier;
    const input = readInput(sk), P = physics();
    state.input = input; state.simScale = scale;
    // Pushing off on purpose (heading roughly where the skier points, below push speed): the 3D view skates.
    state.pushing = input.dir != null && !input.brake && sk.speed < P.pushMax && Math.cos(wrap(input.dir - sk.heading)) > .5;
    for (let i = 0; i < steps; i++) stepSkier(sk, input, env, sdt, P);
    effects(sk, dt * scale);
    sk.x = clamp(sk.x, bounds.x0, bounds.x1); sk.y = clamp(sk.y, bounds.y0, bounds.y1);
    const alt = heightAt(T, sk.x, sk.y);
    state.target = [sk.x, sk.y]; state.alt = alt;
    // Lean the sprite toward the side of the screen the skier is heading to.
    const screenX = Math.cos(sk.heading) * Math.cos(state.angle) - (-Math.sin(sk.heading)) * Math.sin(state.angle);
    state.pose = screenX < -.3 ? 'skierL' : screenX > .3 ? 'skierR' : 'skier';
    const g = env.guide(sk.x, sk.y);
    state.here = g && g.dist < g.width / 2 + 3 ? g : null;
    state.plaza = plazaAt(sk.x, sk.y);
    // Camera faces down the nearby piste; off-piste it follows the fall line. Standing still it
    // holds where it is, so a skier parked between two pistes doesn't spin the view between them.
    // The radar turns with the way the skier is going, smoothed through turns and held when stopped.
    state.radarH ??= sk.heading;
    if (sk.speed > .3) state.radarH += wrap(sk.heading - state.radarH) * (1 - Math.exp(-dt * 2));
    if (sk.speed < .3) target = null;
    else if (g && g.dist < g.width / 2 + 40) target = headingAngle(sampleRoute(g.route, g.d).position, sampleRoute(g.route, g.d + 120).position);
    else { const [gx, gy] = env.gradient(sk.x, sk.y); if (Math.hypot(gx, gy) > .04) target = headingAngle([sk.x, sk.y], [sk.x - gx * 100, sk.y - gy * 100]); }
    // Lifts: ski into the bottom station to board.
    state.nearLift = null; state.canBoard = null;
    for (const l of lifts) {
      const dist = Math.hypot(l.points[0][0] - sk.x, l.points[0][1] - sk.y);
      if (dist < 60 && (!state.nearLift || dist < state.nearLift.dist)) state.nearLift = { lift: l, dist };
    }
    if (state.nearLift?.dist < LIFT_BOARD_RADIUS && state.t > state.liftCooldown) state.canBoard = state.nearLift.lift;
  } else if (state.mode === 'lift') {
    sound.silence();
    const l = state.lift;
    state.liftD = Math.min(l.length, state.liftD + rideSpeed * dt);
    // On a drag lift ← → step sideways in the track (metres left of the line, as the rider faces uphill).
    if (DRAG_LIFTS.has(l.type)) {
      const steer = (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0) - (keys.has('ArrowRight') || keys.has('d') ? 1 : 0);
      state.liftSide = clamp((state.liftSide || 0) + steer * DRAG_STEP * dt, -DRAG_SIDE, DRAG_SIDE);
    }
    const p = sampleRoute(l, state.liftD).position;
    state.target = [p[0], p[1]]; state.alt = p[2]; anchor = .62;
    target = headingAngle(sampleRoute(l, state.liftD + 120).position, sampleRoute(l, state.liftD).position);
    const up = sampleRoute(l, state.liftD).tangent, liftH = Math.atan2(up[1], up[0]);
    state.radarH = (state.radarH ?? liftH) + wrap(liftH - (state.radarH ?? liftH)) * (1 - Math.exp(-dt * 2));
    if (state.liftD >= l.length) {
      // Step off at the top, facing downhill, a few metres away from the station.
      const top = l.points.at(-1), [gx, gy] = env.gradient(top[0], top[1]), gl = Math.hypot(gx, gy) || 1;
      const dir = Math.hypot(gx, gy) > .02 ? [-gx / gl, -gy / gl] : (({ tangent: t }) => t)(sampleRoute(l, l.length));
      state.skier = createSkier(top[0] + dir[0] * 12, top[1] + dir[1] * 12, Math.atan2(dir[1], dir[0]));
      state.mode = 'ski'; state.lift = null; state.liftCooldown = state.t + 4; trail.length = 0;
    }
  } else if (state.mode === 'menu' && !state.target) {
    const base = lifts.find(l => l.name === resort.meta.homeLift) || lifts[0];
    state.target = base.points[0].slice(0, 2);
  }
  if (state.mode === 'menu') sound.silence();
  stepSpray(state.mode === 'menu' ? 0 : dt * scale);
  // The idle menu slowly turns the view; a paused run keeps its camera still.
  if (state.mode === 'menu' && !state.resumeMode) state.angle += dt * .06;
  else if (target !== null) state.angle += wrap(target - state.angle) * (1 - Math.exp(-dt * 1.1));
  state.cam ||= [...state.target];
  const k = 1 - Math.exp(-dt * 10);
  state.cam = [state.cam[0] + (state.target[0] - state.cam[0]) * k, state.cam[1] + (state.target[1] - state.cam[1]) * k];
  state.anchor = (state.anchor ?? anchor) + (anchor - (state.anchor ?? anchor)) * k * .3;
  // Zoom (metres per screen pixel): close when slow, pulled back when fast so the next junction shows.
  const want = state.mode === 'menu' ? (state.resumeMode ? state.mpp ?? 1 : 1.6) : state.mode === 'lift' ? 1.2 : ZOOM.near + (ZOOM.far - ZOOM.near) * clamp((state.skier?.speed ?? 0) / ZOOM.atSpeed, 0, 1);
  state.mpp = (state.mpp ?? want) + (want - (state.mpp ?? want)) * (1 - Math.exp(-dt * 1.5));
}

// ---------- Feel: tracks, spray, sound ----------
// Ski tracks: world points every metre or so, fading out; spray: short-lived snow flecks in metres.
const trail = [], spray = [];
const TRAIL_MAX = 500, TRAIL_LIFE = 12, SPRAY_MAX = 300;
const rand = Math.random;
function effects(sk, dt) {
  const last = trail.at(-1);
  if (!last || Math.hypot(last.x - sk.x, last.y - sk.y) > 1.2) {
    trail.push({ x: sk.x, y: sk.y, h: sk.heading, t: state.t, skid: sk.skid > .5 });
    if (trail.length > TRAIL_MAX) trail.shift();
  }
  // Spray flies out from the outside of the turn (or ahead, braking), more the harder the skis bite.
  const n = sk.skid * sk.speed * dt * 6;
  for (let i = 0; i < n || (i < 1 && rand() < n); i++) {
    if (spray.length > SPRAY_MAX) spray.shift();
    const side = rand() < .5 ? -1 : 1, a = sk.heading + side * (Math.PI / 2) * (.6 + rand() * .5);
    const v = sk.speed * (.15 + rand() * .2);
    spray.push({ x: sk.x, y: sk.y, vx: Math.cos(a) * v + Math.cos(sk.heading) * sk.speed * .5, vy: Math.sin(a) * v + Math.sin(sk.heading) * sk.speed * .5,
      z: .2, vz: 1.5 + rand() * 2.5, life: .4 + rand() * .4 });
  }
  if (sk.surface === 'snow' && sk.speed > 6 && rand() < dt * sk.speed) // powder puffs off-piste
    spray.push({ x: sk.x, y: sk.y, vx: (rand() - .5) * 3, vy: (rand() - .5) * 3, z: .1, vz: 2 + rand() * 2, life: .6 });
  sound.update(sk);
}
function stepSpray(dt) {
  for (const p of spray) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; p.vz -= 9.8 * dt; p.z = Math.max(0, p.z + p.vz * dt); p.life -= dt; }
  for (let i = spray.length - 1; i >= 0; i--) if (spray[i].life <= 0) spray.splice(i, 1);
}

// A cartoon pixel speaker with a smiling face for the sound button: o = outline, b = body,
// w = shine, ~ = sound waves (swapped for a ✕ when muted). Drawn at 1.5× so pixels stay even on 2× screens.
const SPEAKER = [
  '........oo..........',
  '.......obo..........',
  '......obbo.....~~...',
  'ooooooobbo......~~..',
  'owwbbbbbbo..~....~..',
  'owbobbobbo..~~...~~.',
  'obbobbobbo...~....~.',
  'obbbbbbbbo...~....~.',
  'obbobbobbo..~~...~~.',
  'obbboobbbo..~....~..',
  'ooooooobbo......~~..',
  '......obbo.....~~...',
  '.......obo..........',
  '........oo..........',
];
const SPEAKER_X = Array.from({ length: 6 }, (_, k) => [[12 + k, 4 + k], [13 + k, 4 + k], [17 - k, 4 + k], [18 - k, 4 + k]]).flat();
function speakerIcon(muted) {
  const px = [];
  SPEAKER.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.' && !(muted && c === '~')) px.push([x, y, c === '~' ? 'o' : c]); }));
  if (muted) for (const [x, y] of SPEAKER_X) px.push([x, y, 'o']);
  return `<svg class="speaker" viewBox="0 0 20 14" width="30" height="21" shape-rendering="crispEdges" aria-hidden="true">${px.map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" class="${c}"/>`).join('')}</svg>`;
}

// Wind that rises with speed and a hiss when the edges bite. Starts on the first key press (browsers
// keep audio off until then); M mutes, remembered per browser.
const sound = (() => {
  let ctx, wind, hiss, muted = (() => { try { return localStorage.getItem('ski2d.muted') === '1'; } catch { return false; } })();
  function noise(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.start(); return src;
  }
  function chain(type, freq, q) {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    noise(ctx).connect(f).connect(g).connect(ctx.destination); return { f, g };
  }
  const set = (p, v) => p.setTargetAtTime(v, ctx.currentTime, .08);
  return {
    wake() {
      if (ctx || !window.AudioContext) { ctx?.state === 'suspended' && ctx.resume(); return; }
      ctx = new AudioContext(); wind = chain('bandpass', 500, .7); hiss = chain('highpass', 2500, .5);
    },
    toggle() { muted = !muted; try { localStorage.setItem('ski2d.muted', muted ? '1' : '0'); } catch {} if (muted) this.silence(); this.show(); },
    show() { const b = $('mute'); b.innerHTML = speakerIcon(muted) + t(muted ? 'muted' : 'sound'); b.title = t(muted ? 'soundOn' : 'soundOff'); b.classList.toggle('on', muted); },
    silence() { if (ctx) { set(wind.g.gain, 0); set(hiss.g.gain, 0); } },
    update(sk) {
      if (!ctx || muted) return;
      const v = clamp(sk.speed / 30, 0, 1);
      set(wind.g.gain, v * v * .25); set(wind.f.frequency, 300 + v * 900);
      set(hiss.g.gain, sk.skid * clamp(sk.speed / 15, 0, 1) * .12);
    },
  };
})();

// ---------- 3D view (loaded and built on first use, rebuilt after a palette change) ----------
// Three.js is fetched only when someone first switches to 3D, so the 2D game stays light.
let view3d = null, view3dLoading = null;
function setView(v) {
  state.view = v;
  try { localStorage.setItem('ski2d.view', v); } catch {}
  $('hints').textContent = hints();
  viewButton();
}
// The button names the view it switches to.
function viewButton() {
  // Both views are shown with the current one filled in, so the button reads as a switch, not an action.
  const b = $('viewToggle'); if (!b) return;
  b.innerHTML = `<span class="${state.view === '2d' ? 'on' : ''}">${t('viewTop')}</span><span class="${state.view === '3d' ? 'on' : ''}">${t('view3d')}</span>`;
  b.title = t('viewTitle');
}
function render3d(dt) {
  if (!view3d) {
    view3dLoading ||= import('./view3d.js').then(({ createView3D }) => {
      view3d = createView3D({ terrain: resort.terrain, trails, lifts, scenery, masks, frame, tiles, tileM: TILE_M, pal,
        guide: env.guide, trail, spray, trailLife: TRAIL_LIFE });
      view.after(view3d.canvas); view3d.resize(S3D()); view3dLoading = null;
    });
    render(); return; // the 2D view carries on until the 3D one is ready
  }
  view3d.canvas.hidden = false;
  view3d.render(state, dt);
  drawMinimap();
}

// Switching views takes VIEW_TIME seconds: the first VIEW_FADE of it cross-fades the 2D map into a 3D
// camera looking straight down from the same framing, the rest flies that camera down behind the skier
// (and the other way round going back). The menu always shows the 2D map.
const VIEW_TIME = 1.4, VIEW_FADE = .25;
state.blend = state.view === '3d' ? 1 : 0; // 0 = 2D, 1 = 3D
function renderViews(dt) {
  const want = state.view === '3d' ? 1 : 0;
  if (view3d || !want) state.blend = want > state.blend ? Math.min(want, state.blend + dt / VIEW_TIME) : Math.max(want, state.blend - dt / VIEW_TIME);
  if (want && !view3d && state.mode !== 'menu') { render3d(dt); return; } // loads it; the 2D map shows meanwhile
  // Also while the 3D view is still loading (switched back to 2D before it was ready).
  if (state.mode === 'menu' || !state.blend || !view3d) {
    if (view3d) view3d.canvas.hidden = true;
    view.hidden = false; render(); return;
  }
  const fade = clamp(state.blend / VIEW_FADE, 0, 1);
  state.camBlend = clamp((state.blend - VIEW_FADE) / (1 - VIEW_FADE), 0, 1);
  state.top = topFrame();
  view.hidden = fade === 1;
  if (fade < 1) render();
  view3d.canvas.style.opacity = fade;
  render3d(dt);
}
// What the 2D map shows: the world point at the middle of the screen, the way screen-up points, and the height in metres.
function topFrame() {
  const a = state.angle, [cx, cy] = state.cam, v = H * (.5 - state.anchor) * state.mpp;
  return { x: cx + v * Math.sin(a), y: cy - v * Math.cos(a), up: [-Math.sin(a), Math.cos(a)], height: H * state.mpp };
}

// ---------- Rendering ----------
let S = 3, W = 320, H = 200, dpr = 1;
// 3D draws at twice the 2D resolution: perspective squeezes the road ahead into a few rows otherwise.
const S3D = () => S / 2;
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
addEventListener('resize', () => view3d?.resize(S3D()));

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

  // Ski tracks: two thin grooves either side of the path, darker where the skis skidded.
  for (const p of trail) {
    const age = (state.t - p.t) / TRAIL_LIFE; if (age >= 1) continue;
    const [sx, sy] = proj(p.x, p.y);
    if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
    const ox = Math.cos(p.h + a), oy = Math.sin(p.h + a);
    g.globalAlpha = (1 - age) * (p.skid ? .9 : .6); g.fillStyle = pal.snow[4];
    g.fillRect(Math.round(sx - oy * 1.5), Math.round(sy + ox * 1.5), p.skid ? 2 : 1, 1);
    g.fillRect(Math.round(sx + oy * 1.5), Math.round(sy - ox * 1.5), p.skid ? 2 : 1, 1);
  }
  g.globalAlpha = 1;

  const draw = [], labels = [];
  const onScreen = it => { const [sx, sy] = proj(it.x, it.y); if (sx >= -30 && sx <= W + 30 && sy >= -10 && sy <= H + 40) draw.push({ sx, sy, it }); };
  for (const it of entities.near(cx, cy, R)) onScreen(it);
  for (const [tx, ty] of visible) for (const tree of tiles.trees(tx, ty)) onScreen(tree);
  // The skier, standing on the ground or hanging from the cable.
  const [kx, ky] = proj(...state.target);
  if (state.mode === 'ski') draw.push({ sx: kx, sy: ky, it: { kind: state.pose, shadow: 'shadowBig', tuck: state.skier.tuck } });
  draw.sort((p, q) => (p.z ?? p.sy) - (q.z ?? q.sy));
  for (const { sx, sy, it } of draw) {
    const spr = sprites[it.kind];
    if (it.kind.startsWith('pine') || it.shadow) { const sh = sprites[it.shadow || (it.kind === 'pine' ? 'shadowBig' : 'shadowSmall')]; g.drawImage(sh, sx - (sh.width >> 1), sy - 2); }
    // Tucked: the same skier, crouched a few pixels lower.
    if (spr && it.tuck) g.drawImage(spr, sx - (spr.width >> 1), sy - spr.height + 5, spr.width, spr.height - 4);
    else if (spr) g.drawImage(spr, sx - (spr.width >> 1), sy - spr.height + 1);
    if (it.label && Math.hypot(sx - kx, sy - ky) < 95) labels.push({ x: sx, y: sy - (spr ? spr.height : 0) - 2, text: it.label, color: it.labelColor, hot: it.signFor && state.here?.route.id === it.signFor });
  }

  // Snow spray, lifted off the ground by its height.
  for (const p of spray) {
    const [sx, sy] = proj(p.x, p.y);
    g.globalAlpha = clamp(p.life * 3, 0, 1);
    const h = Math.round(p.z * 3);
    if (h > 1) { g.fillStyle = pal.snow[3]; g.fillRect(sx, sy, 1, 1); } // its shadow on the snow
    g.fillStyle = pal.snow[4]; g.fillRect(sx, sy - h + 1, 2, 1);
    g.fillStyle = pal.snowcap; g.fillRect(sx, sy - h, 2, 1);
  }
  g.globalAlpha = 1;
  // Speed lines streaming past, against the skier's motion on screen; reshuffled 15× a second.
  if (state.mode === 'ski' && state.skier.speed > 14) {
    const sk = state.skier, f = clamp((sk.speed - 14) / 18, 0, 1);
    const [hx, hy] = proj(sk.x + Math.cos(sk.heading), sk.y + Math.sin(sk.heading));
    const dl = Math.hypot(hx - kx, hy - ky) || 1, ux = (hx - kx) / dl, uy = (hy - ky) / dl;
    const rnd = seededRandom(Math.floor(state.t * 15)), len = 4 + f * 12;
    g.fillStyle = pal.snow[4]; g.globalAlpha = .6 * f;
    for (let i = 0; i < 6 + f * 14; i++) {
      const px = rnd() * W, py = rnd() * H;
      if (Math.hypot(px - kx, py - ky) < 24) continue; // keep the skier clear
      for (let j = 0; j < len; j++) g.fillRect(Math.round(px - ux * j), Math.round(py - uy * j), 1, 1);
    }
    g.globalAlpha = 1;
  }

  // Lift cables float above the trees: drawn last, through pylon tops.
  g.fillStyle = pal.lift;
  for (const l of lifts) {
    const pts = l.points.map(p => { const [x, y] = proj(p[0], p[1]); return [x, y - CABLE]; });
    if (pts.every(([x, y]) => x < -50 || x > W + 50 || y < -50 || y > H + 50) && !(state.lift === l)) continue;
    for (let i = 1; i < pts.length; i++) pixelLine(g, ...pts[i - 1], ...pts[i]);
    // The lift the player rides is shifted so one chair is exactly the player's (even gaps ahead and
    // behind); the shift is kept after getting off so nothing jumps.
    const run = state.liftClock * liftSpeed(l.type);
    if (state.lift === l) liftPhase.set(l, ((state.liftD - run) % 70 + 70) % 70);
    for (let d = (run + (liftPhase.get(l) || 0)) % 70; d < l.length; d += 70) {
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

// ---------- Maps ----------
// Top right: in a run, a zoomed radar turned so the way ahead is up; in the menu, the whole resort
// north-up. Clicking it (or Tab) opens the full map, which pauses the game.
const RADAR = { size: 200, mpp: 2.5 }; // CSS px across; metres per CSS px
// Both maps draw over one bake of the whole resort at this many metres per pixel, made on first use.
const MAP_MPP = 4;
let mapBase = null;
const mapImage = () => mapBase ||= bakeOverview(frame, resort.terrain, geo, pal, Math.round(frame.w * RES / MAP_MPP));

function drawMinimap() { state.mode === 'menu' ? drawOverview() : drawRadar(); }

function sizeMini(w, h) {
  if (mini.width === Math.round(w * dpr) && mini.height === Math.round(h * dpr)) return;
  mini.width = Math.round(w * dpr); mini.height = Math.round(h * dpr); mini.style.width = w + 'px'; mini.style.height = h + 'px';
}

// Every piste and lift as lines in frame pixels, the one you are on picked out; z = CSS px per frame px.
function strokeRoutes(g, z, active) {
  const path = r => { g.beginPath(); r.points.forEach((p, i) => { const [x, y] = toPx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
  g.lineJoin = g.lineCap = 'round'; g.setLineDash([]);
  for (const t of trails) { path(t); g.strokeStyle = pal.trail[t.difficulty]; g.lineWidth = 2 / z; g.stroke(); }
  g.setLineDash([4 / z, 3 / z]);
  for (const l of lifts) { path(l); g.strokeStyle = pal.lift; g.lineWidth = 1.5 / z; g.stroke(); }
  g.setLineDash([]);
  if (active) { path(active); g.strokeStyle = pal.ink; g.lineWidth = 6 / z; g.stroke(); g.strokeStyle = pal.trail[active.difficulty] || pal.ui; g.lineWidth = 3 / z; g.stroke(); }
}

// You: an arrow at (x, y) pointing along the canvas angle a, k times its radar size.
function drawYou(g, x, y, a, k = 1) {
  g.save(); g.translate(x, y); g.rotate(a); g.scale(k, k);
  g.fillStyle = pal.uiAccent; g.strokeStyle = pal.ui; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 7); g.lineTo(0, 3); g.lineTo(-7, 7); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

function drawRadar() {
  const s = RADAR.size, z = RES / RADAR.mpp, g = mctx;
  sizeMini(s, s); mini.classList.add('radar');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = pal.bg; g.fillRect(0, 0, s, s);
  // In 3D the radar follows the camera, so up on the map is straight into the screen.
  const h = state.view === '3d' && view3d ? view3d.heading : state.radarH ?? 0, turn = h - Math.PI / 2;
  const [x, y] = frame.toPx(...state.target), cx = s / 2, cy = s * .6; // a little low, so more of the way ahead shows
  g.save(); g.translate(cx, cy); g.rotate(turn); g.scale(z, z); g.translate(-x, -y);
  g.imageSmoothingEnabled = false;
  g.drawImage(mapImage(), 0, 0, frame.w, frame.h);
  strokeRoutes(g, z, state.mode === 'lift' ? state.lift : state.here?.route);
  g.restore();
  drawYou(g, cx, cy, 0);
  // North on the rim.
  const r = s / 2 - 12, nx = s / 2 + Math.sin(turn) * r, ny = s / 2 - Math.cos(turn) * r;
  g.fillStyle = pal.ui; g.strokeStyle = pal.ink; g.lineWidth = 2;
  g.beginPath(); g.arc(nx, ny, 9, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = pal.uiInk; g.font = '700 11px "Pixelify Sans", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', nx, ny + 1);
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}

// The full map: frame pixel (cx, cy) at the middle of the screen, z CSS px per frame px.
const big = { open: false, cx: 0, cy: 0, z: 1, fit: 1, drag: null };
const bigCanvas = $('bigmapCanvas'), bctx = bigCanvas.getContext('2d');
function openMap() {
  big.open = true; $('bigmap').hidden = false;
  big.z = big.fit = Math.min(innerWidth * .94 / frame.w, (innerHeight - 80) * .94 / frame.h);
  big.cx = frame.w / 2; big.cy = frame.h / 2 + 30 / big.z;
  drawBigMap();
}
function closeMap() { big.open = false; $('bigmap').hidden = true; last = performance.now(); }
function centreMapOnMe() {
  [big.cx, big.cy] = frame.toPx(...state.target); big.z = Math.max(big.z, big.fit * 4); drawBigMap();
}

function drawBigMap() {
  const w = innerWidth, h = innerHeight, g = bctx, base = mapImage();
  if (bigCanvas.width !== Math.round(w * dpr) || bigCanvas.height !== Math.round(h * dpr)) {
    bigCanvas.width = Math.round(w * dpr); bigCanvas.height = Math.round(h * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = pal.bg; g.fillRect(0, 0, w, h);
  const sx = px => w / 2 + (px - big.cx) * big.z, sy = py => h / 2 + (py - big.cy) * big.z;
  g.save(); g.translate(sx(0), sy(0)); g.scale(big.z, big.z);
  g.imageSmoothingEnabled = big.z * frame.w < base.width; // smooth only when shrinking
  g.drawImage(base, 0, 0, frame.w, frame.h);
  strokeRoutes(g, big.z, state.mode === 'lift' ? state.lift : state.here?.route);
  g.restore();
  // Names: lifts first, then the longest pistes, skipping any that would overlap one already placed.
  g.font = '600 12px "Pixelify Sans", ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const placed = [], names = [
    ...lifts.map(l => ({ r: l, text: '🚡 ' + l.name })),
    ...trails.filter(t => t.name).sort((a, b) => b.length - a.length).map(t => ({ r: t, text: t.name })),
  ];
  for (const { r, text } of names) {
    const [px, py] = toPx(sampleRoute(r, r.length / 2).position), x = sx(px), y = sy(py);
    const bw = g.measureText(text).width + (r.difficulty ? 16 : 10), box = [x - bw / 2, y - 9, bw, 18];
    if (x < 0 || y < 50 || x > w || y > h) continue;
    if (placed.some(b => b[0] < box[0] + box[2] && box[0] < b[0] + b[2] && b[1] < box[1] + box[3] && box[1] < b[1] + b[3])) continue;
    placed.push(box);
    g.fillStyle = pal.ui; g.strokeStyle = pal.ink; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(...box, 5); g.fill(); g.stroke();
    if (r.difficulty) { g.fillStyle = pal.trail[r.difficulty]; g.fillRect(box[0] + 4, y - 4, 4, 8); }
    g.fillStyle = pal.uiInk; g.fillText(text, x + (r.difficulty ? 3 : 0), y + 1);
  }
  if (state.mode !== 'menu' || state.resumeMode) {
    const [px, py] = frame.toPx(...state.target), hd = state.view === '3d' && view3d ? view3d.heading : state.radarH ?? Math.PI / 2;
    g.fillStyle = pal.uiAccent + '55'; g.strokeStyle = pal.uiAccent; g.lineWidth = 2;
    g.beginPath(); g.arc(sx(px), sy(py), 22, 0, Math.PI * 2); g.fill(); g.stroke();
    drawYou(g, sx(px), sy(py), Math.PI / 2 - hd, 1.5);
  }
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}

mini.addEventListener('click', openMap);
bigCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  const nz = clamp(big.z * Math.exp(-e.deltaY * .0015), big.fit, big.fit * 16);
  const mx = e.clientX - innerWidth / 2, my = e.clientY - innerHeight / 2; // keep the point under the cursor still
  big.cx += mx / big.z - mx / nz; big.cy += my / big.z - my / nz; big.z = nz;
  drawBigMap();
}, { passive: false });
bigCanvas.addEventListener('pointerdown', e => { big.drag = [e.clientX, e.clientY]; bigCanvas.setPointerCapture(e.pointerId); });
bigCanvas.addEventListener('pointermove', e => {
  if (!big.drag) return;
  big.cx -= (e.clientX - big.drag[0]) / big.z; big.cy -= (e.clientY - big.drag[1]) / big.z; big.drag = [e.clientX, e.clientY];
  drawBigMap();
});
bigCanvas.addEventListener('pointerup', () => { big.drag = null; });
addEventListener('resize', () => { if (big.open) drawBigMap(); });

function drawOverview() {
  const w = miniBase.width, h = miniBase.height, k = w / frame.w;
  sizeMini(w, h); mini.classList.remove('radar');
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
  // In 3D it points where the camera looks instead.
  const in3d = state.view === '3d' && view3d && state.mode !== 'menu';
  const dx = in3d ? Math.cos(view3d.heading) : -Math.sin(state.angle), dy = in3d ? -Math.sin(view3d.heading) : Math.cos(state.angle);
  mctx.fillStyle = pal.uiAccent; mctx.strokeStyle = pal.ui; mctx.lineWidth = 1.5;
  mctx.beginPath(); mctx.moveTo(x * k + dx * 9, y * k + dy * 9); mctx.lineTo(x * k - dy * 4, y * k + dx * 4); mctx.lineTo(x * k + dy * 4, y * k - dx * 4); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.fillStyle = pal.ink; mctx.font = '700 11px "Pixelify Sans", system-ui'; mctx.fillText('N ↑', 8, 14);
}

function updateHud() {
  const prompt = $('prompt');
  if (state.mode === 'ski') {
    const sk = state.skier, r = state.here?.route;
    const where = state.plaza ? `<b>🚡 ${state.plaza.lift.name} ${t(state.plaza.end === 'top' ? 'stationTop' : 'stationBottom')}</b><span>${t('plaza')} · ${t(state.view === '3d' ? 'plaza3d' : 'plaza2d')}</span>`
      : r ? `<b>${chip(r.difficulty)}${label(r)}</b><span>${DIFF[r.difficulty]}${r.estimated ? ' · ' + EST : ''}</span>`
      : `<b>${t(sk.surface === 'forest' ? 'forest' : 'offPiste')}</b><span>${t(state.feel === 'arcade' ? (sk.surface === 'forest' ? 'forestArcade' : 'offArcade') : 'offReal')}</span>`;
    const x = (state.feel === 'arcade' ? 1 : state.timeScale) * (keys.has('Shift') ? SCALE.shift : 1);
    $('hud').innerHTML = `${where}<span>${Math.round(sk.speed * 3.6)} km/h${sk.tuck ? ' · ' + t('tuck') : ''}${x > 1.05 ? ' · ' + t('speedX', { x: x.toFixed(1) }) : ''} · ${t('altitude', { m: Math.round(state.alt) })}</span>`;
    const nl = state.nearLift;
    prompt.hidden = !nl;
    if (nl) prompt.innerHTML = state.canBoard ? t('board', { lift: nl.lift.name, m: Math.round(nl.lift.points.at(-1)[2] - nl.lift.points[0][2]) })
      : t('liftAhead', { lift: nl.lift.name });
  } else if (state.mode === 'lift') {
    $('hud').innerHTML = `<b>🚡 ${state.lift.name}</b><span>${t('altitude', { m: Math.round(state.alt) })} · ${t(state.liftFast ? 'liftFast' : 'liftNormal')}${DRAG_LIFTS.has(state.lift.type) ? ' · ' + t('liftSteer') : ''}</span><div class="bar"><i style="width:${(state.liftD / state.lift.length * 100).toFixed(1)}%"></i></div>`;
    prompt.hidden = true;
  } else prompt.hidden = true;
}

// ---------- Boot ----------
resize();
setPalette('warm');
showMenu();
setFeel(state.feel);
let last = performance.now();
let loggedError = false;
function frameLoop(now) {
  // Schedule first: one bad frame must not stop the game.
  requestAnimationFrame(frameLoop);
  const dt = clamp((now - last) / 1000, 0, .05); last = now;
  try {
    if (!big.open) update(dt);
    renderViews(dt);
    updateHud();
  }
  catch (err) { if (!loggedError) { console.error(err); loggedError = true; } }
}
requestAnimationFrame(frameLoop);
// Debug hooks for automated screenshots.
window.__ski = { state, trails, lifts, startAt, setPalette, showMenu, update, render, keys, frame: now => frameLoop(now) };
