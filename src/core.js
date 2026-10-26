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
  turn: [3, .5],       // max turn rate in rad/s: standing still → at turnSpeed (m/s) and above
  turnSpeed: 20,
  turnRamp: .8,        // seconds of holding a key before the full turn rate is reached
  turnLoss: .08,       // fraction of speed lost per radian turned at speed (skidding)
  assist: 1.6, assistRange: 50, fallLine: 1.2,
  minGrade: .08, crossSlope: .25,
};

export function createSkier(x, y, heading) {
  return { x, y, heading, speed: 0, surface: 'piste' };
}

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const turnToward = (from, to, maxStep) => { const d = wrapAngle(to - from); return wrapAngle(from + clamp(d, -maxStep, maxStep)); };

export function stepSkier(sk, input, env, dt) {
  dt = clamp(dt, 0, .1);
  const surface = env.surface(sk.x, sk.y);
  sk.surface = surface;
  const t = clamp(sk.speed / SKI.turnSpeed, 0, 1);
  const maxTurn = lerp(SKI.turn[0], SKI.turn[1], t) * dt;
  const before = sk.heading;
  const g = env.guide?.(sk.x, sk.y);
  let [gx, gy] = env.gradient(sk.x, sk.y);
  const wantsDir = input.dir !== null && input.dir !== undefined;
  // Holding a key eases into the turn: the rate ramps up over SKI.turnRamp seconds.
  sk.hold = wantsDir ? (sk.hold || 0) + dt : 0;
  if (wantsDir) {
    sk.heading = turnToward(sk.heading, input.dir, maxTurn * Math.min(1, .25 + sk.hold / SKI.turnRamp));
  } else if (g && g.dist < g.width / 2 + SKI.assistRange) {
    // Along the piste, and back toward it when near or past its edge.
    // Aim at a point a little further down the centreline (pure pursuit): rounds hairpins and
    // brings a skier who drifted off back in. Without a route (tests), follow the tangent.
    let target = Math.atan2(g.tangent[1], g.tangent[0]);
    if (g.route?.cumulative) {
      const aim = sampleRoute(g.route, g.d + 12 + sk.speed + Math.max(0, g.dist - g.width / 2)).position;
      if (Math.hypot(aim[0] - sk.x, aim[1] - sk.y) > 2) target = Math.atan2(aim[1] - sk.y, aim[0] - sk.x);
    }
    sk.heading = turnToward(sk.heading, target, maxTurn * Math.min(1, SKI.assist * Math.max(.4, Math.min(1, sk.speed / 3))));
    // Too fast for a bend: scrub speed like a real skier would, so hairpins don't fling us off.
    if (Math.abs(wrapAngle(target - sk.heading)) > 1 && sk.speed > 8) sk.speed -= SKI.brake * .5 * dt;
  } else if (Math.hypot(gx, gy) > .03) {
    sk.heading = turnToward(sk.heading, Math.atan2(-gy, -gx), maxTurn * SKI.fallLine / SKI.turn[0] * 2);
  }
  sk.speed *= 1 - Math.min(.5, Math.abs(wrapAngle(sk.heading - before)) * SKI.turnLoss * t);
  // On a piste, the slope along it comes from the piste's own altitude profile (sampled at its
  // OSM nodes, finer than the 40 m terrain grid), so mapped descents never read as flat or uphill.
  if (g?.route?.cumulative && g.dist < g.width / 2) {
    const [tx, ty] = g.tangent;
    let along = (sampleRoute(g.route, g.d + 25).position[2] - sampleRoute(g.route, g.d - 25).position[2]) / Math.max(1, Math.min(50, g.route.length));
    // A piste that descends overall never reads flatter than SKI.minGrade along its direction,
    // so traverses and DEM bumps keep a slow glide instead of stranding the skier mid-piste.
    if (g.route.drop > 0) along = Math.min(along, -SKI.minGrade);
    // Groomed pistes are roughly level across: keep only part of the terrain's cross-slope.
    const k = gx * tx + gy * ty;
    const crossX = gx - k * tx, crossY = gy - k * ty;
    gx = along * tx + crossX * SKI.crossSlope; gy = along * ty + crossY * SKI.crossSlope;
  }
  const hx = Math.cos(sk.heading), hy = Math.sin(sk.heading);
  const slope = -(gx * hx + gy * hy);                       // rise over run along the heading, + = downhill
  const sin = slope / Math.sqrt(1 + slope * slope), cos = 1 / Math.sqrt(1 + slope * slope);
  let acc = SKI.g * sin;
  acc -= (sk.speed > 0 ? SKI.g * cos * (SKI.mu[surface] ?? .25) : 0) + (SKI.drag[surface] ?? .01) * sk.speed * sk.speed;
  if (input.brake) acc -= SKI.brake;
  // Holding a direction at low speed = skating / poling that way (works on the flat and gentle climbs).
  // Climbing (herringbone) is slow: the steeper the uphill, the lower the speed you can push to.
  const climb = Math.max(0, gx * hx + gy * hy);
  const pushMax = SKI.pushMax * clamp(1 - climb * 6, .2, 1);
  if (wantsDir && !input.brake && sk.speed < pushMax) acc += SKI.push * Math.max(0, Math.cos(wrapAngle(input.dir - sk.heading)));
  // Hands-off and stranded just off a piste: skate slowly back onto it.
  else if (!wantsDir && !input.brake && surface !== 'piste' && surface !== 'plaza' && g && g.dist < g.width / 2 + SKI.assistRange && sk.speed < 1.5) acc += SKI.push;
  sk.speed = clamp(sk.speed + acc * dt, 0, SKI.capSpeed[surface] ?? SKI.maxSpeed);
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
