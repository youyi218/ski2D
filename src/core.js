export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// orient=false keeps the source drawing direction (OSM draws pistes in the direction of travel).
export function prepareRoute(source, uphill = false, orient = true) {
  if (!Array.isArray(source.points) || source.points.some(p => p.length < 3 || !p.every(Number.isFinite))) {
    throw new Error('Invalid route coordinates');
  }
  let points = source.points.filter((p, i, arr) => i === 0 || distance2(p, arr[i - 1]) > .01).map(p => [...p]);
  if (points.length < 2) throw new Error('Degenerate route');
  if (orient && (uphill ? points[0][2] > points.at(-1)[2] : points[0][2] < points.at(-1)[2])) points.reverse();
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distance2(points[i], points[i - 1]));
  return { ...source, points, cumulative, length: cumulative.at(-1), drop: points[0][2] - points.at(-1)[2] };
}

export function sampleRoute(route, distance) {
  const d = clamp(distance, 0, route.length);
  let lo = 0, hi = route.points.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (route.cumulative[mid] <= d) lo = mid; else hi = mid; }
  const a = route.points[lo], b = route.points[hi];
  const span = route.cumulative[hi] - route.cumulative[lo];
  const t = span ? (d - route.cumulative[lo]) / span : 0;
  return {
    position: a.map((v, i) => lerp(v, b[i], t)),
    tangent: [(b[0] - a[0]) / span, (b[1] - a[1]) / span],
    slope: (a[2] - b[2]) / span,
  };
}

export function heightAt(t, x, y) {
  const gx = clamp((x - t.minX) / t.stepX, 0, t.cols - 1);
  const gy = clamp((y - t.minY) / t.stepY, 0, t.rows - 1);
  const ix = Math.min(Math.floor(gx), t.cols - 2), iy = Math.min(Math.floor(gy), t.rows - 2);
  const fx = gx - ix, fy = gy - iy;
  const get = (cx, cy) => t.heights[cy * t.cols + cx];
  return lerp(lerp(get(ix, iy), get(ix + 1, iy), fx), lerp(get(ix, iy + 1), get(ix + 1, iy + 1), fx), fy);
}

// ---------- Shape ----------
// Round off corners (Chaikin corner cutting, only where the line bends more than minTurn radians),
// cutting at most ~0.6 × width so a wide piste turns in a smooth arc. Endpoints stay put.
export function roundCorners(points, width = 45, { minTurn = .35, passes = 2 } = {}) {
  let pts = points.map(p => [...p]);
  for (let pass = 0; pass < passes; pass++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const ab = distance2(a, b), bc = distance2(b, c);
      const turn = Math.abs(Math.atan2(Math.sin(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])), Math.cos(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]))));
      if (turn < minTurn || ab < 1 || bc < 1) { out.push(b); continue; }
      const cut = Math.min(ab * .3, bc * .3, width * .6 / (pass + 1));
      out.push(b.map((v, k) => v + (a[k] - v) * cut / ab), b.map((v, k) => v + (c[k] - v) * cut / bc));
    }
    out.push(pts.at(-1));
    pts = out;
  }
  return pts;
}

// ---------- Widths ----------
// route.width is the default; route.widthSections = [[from, to, width], ...] as fractions of length.
export function widthAt(route, d) {
  const f = route.length ? d / route.length : 0;
  let w = route.width ?? 45;
  for (const [f0, f1, sw] of route.widthSections || []) if (f >= f0 && f <= f1) w = sw;
  return w;
}

// Contiguous pieces of constant width covering the route, for drawing.
export function widthIntervals(route) {
  const cuts = new Set([0, route.length]);
  for (const [f0, f1] of route.widthSections || []) { cuts.add(f0 * route.length); cuts.add(f1 * route.length); }
  const sorted = [...cuts].filter(d => d >= 0 && d <= route.length).sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const d0 = sorted[i - 1], d1 = sorted[i];
    if (d1 - d0 < .5) continue;
    out.push({ d0, d1, width: widthAt(route, (d0 + d1) / 2) });
  }
  return out;
}

export function subPolyline(route, d0, d1) {
  const pts = [sampleRoute(route, d0).position];
  route.cumulative.forEach((c, i) => { if (c > d0 && c < d1) pts.push(route.points[i]); });
  pts.push(sampleRoute(route, d1).position);
  return pts;
}

// ---------- Nearest piste (grid of segments) ----------
export function buildPisteIndex(routes, cell = 100) {
  const grid = new Map();
  for (const r of routes) for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1], b = r.points[i];
    for (let gx = Math.floor(Math.min(a[0], b[0]) / cell) - 1; gx <= Math.floor(Math.max(a[0], b[0]) / cell) + 1; gx++)
      for (let gy = Math.floor(Math.min(a[1], b[1]) / cell) - 1; gy <= Math.floor(Math.max(a[1], b[1]) / cell) + 1; gy++) {
        const k = gx + ',' + gy; (grid.get(k) || grid.set(k, []).get(k)).push([r, i]);
      }
  }
  return { grid, cell };
}

// Closest piste centreline to (x, y): { route, d (distance along), dist, tangent, width } or null.
export function nearestPiste(index, x, y) {
  const list = index.grid.get(Math.floor(x / index.cell) + ',' + Math.floor(y / index.cell));
  let best = null;
  for (const [r, i] of list || []) {
    const a = r.points[i - 1], b = r.points[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
    const u = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (L * L), 0, 1);
    const dist = Math.hypot(a[0] + u * dx - x, a[1] + u * dy - y);
    const d = r.cumulative[i - 1] + u * L;
    // Prefer the piste whose edge is closest, so a wide piste wins over a thin one next to it.
    // Past a piste's last metre it no longer guides anywhere: let the next piste take over.
    const score = dist - widthAt(r, d) / 2 + (d >= r.length - .5 ? 25 : 0);
    if (!best || score < best.score) best = { route: r, d, dist, score, tangent: [dx / L, dy / L], width: widthAt(r, d), point: [a[0] + u * dx, a[1] + u * dy] };
  }
  return best;
}

// ---------- Free skiing ----------
// The skier always points somewhere and gravity along that heading speeds them up or slows them down.
// input.dir = the world angle the player wants to go (from the arrow keys), or null for hands-off;
// the heading turns toward it at a limited rate, so reversing at speed is a slow arc, not a flip.
// Hands-off, the heading drifts along the nearest piste, or down the fall line off-piste.
// env.gradient(x, y) → [dz/dx, dz/dy]; env.surface(x, y) → 'piste' | 'plaza' | 'snow' | 'forest';
// env.guide(x, y) → nearestPiste result or null; env.blocked(x, y) → true outside the ski domain.
// Physics: a = g·(slope − μ) − k·v², with real-world values:
//   g = 9.81; μ = snow friction coefficient (≈ .05 on groomed snow);
//   k = ½·ρ·Cd·A / m ≈ ½ · 1.0 kg/m³ (air at 2000 m) · 0.5 m² (upright skier) / 75 kg ≈ .0035 per metre.
// On a 20 % blue run straight down that gives a terminal speed of about 70 km/h.
export const SKI = {
  g: 9.81,
  mu: { piste: .05, plaza: .08, snow: .25, forest: .45 },
  drag: { piste: .0035, plaza: .0035, snow: .01, forest: .05 },
  maxSpeed: 33,        // safety cap (~120 km/h), physics normally stops well below
  capSpeed: { forest: 5 },
  brake: 7, push: 4, pushMax: 4,
  scrub: 3.5,         // how hard hands-off skiing slows for a bend too tight to make
  turn: [3, .5],       // max turn rate in rad/s: standing still → at turnSpeed (m/s) and above
  turnSpeed: 20,
  turnRamp: .8,        // seconds of holding a key before the full turn rate is reached
  turnLoss: .08,       // fraction of speed lost per radian turned at speed (skidding)
  assist: 1.6, assistRange: 50, fallLine: 1.2,
  minGrade: .08, crossSlope: .25,
  tuck: 0, tuckDrag: 1, glide: 0, time: 1,
  grip: 0, skidGrip: 1,
};

// Real line speed of each lift type (m/s). The lifts on the mountain run at this speed in game time;
// the player's own ride is fast-forwarded unless they switch to normal speed.
export const LIFT_SPEED = { chair_lift: 5, mixed_lift: 5, gondola: 6, cable_car: 10, platter: 3, 't-bar': 3, 'j-bar': 3, drag_lift: 3, rope_tow: 2.5, magic_carpet: 1 };
export const liftSpeed = type => LIFT_SPEED[type] || 4;
// Drag lifts: the skier stands on their skis and is pulled up the track.
export const DRAG_LIFTS = new Set(['platter', 't-bar', 'j-bar', 'drag_lift', 'rope_tow']);

// Arcade feel: snappy carving that keeps speed, less friction, a tuck to go faster, fun powder,
// and a minimum glide on pistes. The mountain stays real; only the skier cheats.
export const ARCADE = {
  ...SKI,
  mu: { piste: .035, plaza: .06, snow: .07, forest: .2 },
  drag: { piste: .0018, plaza: .0035, snow: .004, forest: .02 },
  maxSpeed: 40,
  capSpeed: { forest: 12 },
  brake: 3.5, push: 6, pushMax: 6, // a gradual brake: from 110 km/h to a stop takes about 4 seconds
  scrub: 7,
  turn: [4, 1.6],
  turnRamp: .25,
  // Edge grip caps the sideways pull (m/s²), so the tightest turn radius is v² / grip:
  // about 10 m at 36 km/h, 40 m at 72 km/h, 90 m at 108 km/h. Braking into a turn skids
  // the skis round, tighter by skidGrip.
  grip: 10, skidGrip: 2.2,
  turnLoss: .015,
  assist: 1.1,
  tuck: 2.5,          // extra push (m/s²) while tucked
  tuckDrag: .5,       // air drag multiplier while tucked
  glide: 5,           // on a piste, never slower than this unless braking
  time: 1.5,          // the simulation runs this much faster than real time
};

export function createSkier(x, y, heading) {
  return { x, y, heading, speed: 0, surface: 'piste' };
}

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const turnToward = (from, to, maxStep) => { const d = wrapAngle(to - from); return wrapAngle(from + clamp(d, -maxStep, maxStep)); };

export function stepSkier(sk, input, env, dt, P = SKI) {
  dt = clamp(dt, 0, .1);
  const surface = env.surface(sk.x, sk.y);
  sk.surface = surface;
  const t = clamp(sk.speed / P.turnSpeed, 0, 1);
  // Tightest turn the edges allow at this speed (radians this step), or no limit without grip.
  const gripTurn = P.grip ? P.grip * (input.brake ? P.skidGrip : 1) / Math.max(sk.speed, .5) * dt : Infinity;
  const maxTurn = Math.min(lerp(P.turn[0], P.turn[1], t) * dt, gripTurn);
  const before = sk.heading;
  const g = env.guide?.(sk.x, sk.y);
  let [gx, gy] = env.gradient(sk.x, sk.y);
  const wantsDir = input.dir !== null && input.dir !== undefined;
  // Holding a key eases into the turn: the rate ramps up over P.turnRamp seconds.
  sk.hold = wantsDir ? (sk.hold || 0) + dt : 0;
  // Stopped on a plaza or a piste that doesn't descend: steering can't get the skier moving, and
  // the nearest piste can flick between two runs every frame, so hands-off they just stand still.
  const stranded = sk.speed < .3 && (surface === 'plaza' || (g?.route && !(g.route.drop > 0)));
  if (wantsDir) {
    sk.heading = turnToward(sk.heading, input.dir, maxTurn * Math.min(1, .25 + sk.hold / P.turnRamp));
  } else if (stranded) {
    // Leave the heading alone.
  } else if (g && g.dist < g.width / 2 + P.assistRange) {
    // Along the piste, and back toward it when near or past its edge.
    // Aim at a point a little further down the centreline (pure pursuit): rounds hairpins and
    // brings a skier who drifted off back in. Without a route (tests), follow the tangent.
    let target = Math.atan2(g.tangent[1], g.tangent[0]);
    if (g.route?.cumulative) {
      const aim = sampleRoute(g.route, g.d + 12 + sk.speed + Math.max(0, g.dist - g.width / 2)).position;
      if (Math.hypot(aim[0] - sk.x, aim[1] - sk.y) > 2) target = Math.atan2(aim[1] - sk.y, aim[0] - sk.x);
    }
    sk.heading = turnToward(sk.heading, target, maxTurn * Math.min(1, P.assist * Math.max(.4, Math.min(1, sk.speed / 3))));
    // Too fast for a bend: scrub speed like a real skier would, so hairpins don't fling us off.
    // With limited grip the bend needs checking earlier, before it is too late to make it.
    if (Math.abs(wrapAngle(target - sk.heading)) > (P.grip ? .45 : 1) && sk.speed > 8) sk.speed -= P.scrub * dt;
  } else if (Math.hypot(gx, gy) > .03) {
    sk.heading = turnToward(sk.heading, Math.atan2(-gy, -gx), maxTurn * P.fallLine / P.turn[0] * 2);
  }
  sk.speed *= 1 - Math.min(.5, Math.abs(wrapAngle(sk.heading - before)) * P.turnLoss * t);
  // On a piste, the slope along it comes from the piste's own altitude profile (sampled at its
  // OSM nodes, finer than the 40 m terrain grid), so mapped descents never read as flat or uphill.
  if (g?.route?.cumulative && g.dist < g.width / 2) {
    const [tx, ty] = g.tangent;
    let along = (sampleRoute(g.route, g.d + 25).position[2] - sampleRoute(g.route, g.d - 25).position[2]) / Math.max(1, Math.min(50, g.route.length));
    // A piste that descends overall never reads flatter than P.minGrade along its direction,
    // so traverses and DEM bumps keep a slow glide instead of stranding the skier mid-piste.
    if (g.route.drop > 0) along = Math.min(along, -P.minGrade);
    // Groomed pistes are roughly level across: keep only part of the terrain's cross-slope.
    const k = gx * tx + gy * ty;
    const crossX = gx - k * tx, crossY = gy - k * ty;
    gx = along * tx + crossX * P.crossSlope; gy = along * ty + crossY * P.crossSlope;
  }
  const hx = Math.cos(sk.heading), hy = Math.sin(sk.heading);
  const slope = -(gx * hx + gy * hy);                       // rise over run along the heading, + = downhill
  const sin = slope / Math.sqrt(1 + slope * slope), cos = 1 / Math.sqrt(1 + slope * slope);
  let acc = P.g * sin;
  acc -= (sk.speed > 0 ? P.g * cos * (P.mu[surface] ?? .25) : 0) + (P.drag[surface] ?? .01) * sk.speed * sk.speed;
  if (input.tuck && !input.brake) acc += P.tuck + (P.drag[surface] ?? .01) * sk.speed * sk.speed * (1 - P.tuckDrag);
  // Arcade braking always slows the skier, steep or not: the slope can't push them faster while braking.
  if (input.brake) acc = (P.grip ? Math.min(acc, 0) : acc) - P.brake;
  // Holding a direction at low speed = skating / poling that way (works on the flat and gentle climbs).
  // Climbing (herringbone) is slow: the steeper the uphill, the lower the speed you can push to.
  const climb = Math.max(0, gx * hx + gy * hy);
  const pushMax = P.pushMax * clamp(1 - climb * 6, .2, 1);
  if (wantsDir && !input.brake && sk.speed < pushMax) acc += P.push * Math.max(0, Math.cos(wrapAngle(input.dir - sk.heading)));
  // Hands-off and stranded just off a piste: skate slowly back onto it.
  else if (!wantsDir && !input.brake && surface !== 'piste' && surface !== 'plaza' && g && g.dist < g.width / 2 + P.assistRange && sk.speed < 1.5) acc += P.push;
  sk.speed = clamp(sk.speed + acc * dt, 0, P.capSpeed[surface] ?? P.maxSpeed);
  if (P.glide && !input.brake && (surface === 'piste') && g?.route?.drop > 0) sk.speed = Math.max(sk.speed, Math.min(P.glide, sk.speed + P.push * dt));
  // How hard the skis are biting into the snow (0–1): drives spray and the carving sound.
  const turnRate = Math.abs(wrapAngle(sk.heading - before)) / Math.max(dt, 1e-6);
  sk.skid = sk.speed < 2 ? 0 : clamp((input.brake ? 1 : 0) + turnRate * t / 2.5, 0, 1);
  sk.tuck = !!input.tuck && !input.brake;
  const nx = sk.x + hx * sk.speed * dt, ny = sk.y + hy * sk.speed * dt;
  if (env.blocked?.(nx, ny)) {
    // Domain edge: stop and swing back toward the piste.
    sk.speed = Math.min(sk.speed * .3, 1.5);
    if (g?.point) sk.heading = turnToward(sk.heading, Math.atan2(g.point[1] - sk.y, g.point[0] - sk.x), maxTurn * 3);
  } else { sk.x = nx; sk.y = ny; }
  return sk;
}

export function seededRandom(seed = 17) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
