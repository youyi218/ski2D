// Lifts and buildings for the 3D view, from the same resort data the 2D map uses.
// World: x east, y north, z altitude (metres); Three.js is y-up, so world (x, y, z) → (x, z, −y).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleRoute, widthAt, liftSpeed, DRAG_LIFTS, buildingShape } from './core.js';

const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);
const mat = c => new THREE.MeshLambertMaterial({ color: c });
// A box translated so its local position is `at` (used to assemble carriers from parts).
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// Per lift type: tower height, half the gap between the two cable lines, station size [long, wide, tall],
// carrier spacing (m), and how deep the cable sags (fraction of the span). Carriers move at the lift's
// real speed (liftSpeed in core.js) in lift time (see update()).
const DRAG_ARM = 2.5; // how far a drag lift's towers stand beside the track (m)
const LIFT = {
  chair_lift: { tower: 10, gauge: 2.6, station: [14, 9, 5], every: 30, sag: .025 },
  gondola: { tower: 14, gauge: 3, station: [22, 11, 7], every: 70, sag: .025 },
  cable_car: { tower: 32, gauge: 4, station: [22, 13, 10], every: Infinity, sag: .045 },
  platter: { tower: 6, gauge: 0, station: [4, 3, 3], every: 14, sag: .01 },
};

// Carriers, built facing +x with the grip on the cable at the origin.
export function carrierGeometry(type) {
  if (type === 'gondola') return mergeGeometries([boxAt(.12, 1.6, .12, 0, -.8, 0), boxAt(2, 2.1, 1.7, 0, -2.6, 0), boxAt(2.1, .2, 1.8, 0, -1.5, 0)]);
  if (type === 'cable_car') return mergeGeometries([boxAt(.3, 3, .3, 0, -1.5, 0), boxAt(4.5, 3, 3.2, 0, -4.5, 0), boxAt(4.7, .3, 3.4, 0, -2.9, 0)]);
  if (type === 'platter') return mergeGeometries([boxAt(.06, 1.6, .06, 0, -.8, 0), new THREE.CylinderGeometry(.22, .22, .08, 8).translate(0, -1.6, 0)]);
  // Chair: hanger down to a three-seat bench with a back and a footrest.
  return mergeGeometries([boxAt(.1, 2.2, .1, 0, -1.1, 0), boxAt(.6, .1, 2, .1, -2.2, 0), boxAt(.1, .7, 2, -.2, -1.85, 0), boxAt(.1, .1, 2, .5, -2.7, 0)]);
}

// A cable as a sampled 3D polyline with cumulative length, sagging between supports.
function cablePath(supports, sag) {
  const pts = [];
  for (let i = 1; i < supports.length; i++) {
    const a = supports[i - 1], b = supports[i], span = a.distanceTo(b), n = Math.max(2, Math.ceil(span / 15));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -4 * span * sag * t * (1 - t), 0)));
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, cum, length: cum.at(-1) };
}
function sampleCable(c, d, out, dir) {
  let lo = 0, hi = c.pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c.cum[mid] <= d) lo = mid; else hi = mid; }
  const t = (d - c.cum[lo]) / (c.cum[hi] - c.cum[lo] || 1);
  out.copy(c.pts[lo]).lerp(c.pts[hi], t); dir.copy(c.pts[hi]).sub(c.pts[lo]);
  return out;
}

// Towers, cables, stations and moving carriers. Lifts must run bottom → top (prepareRoute(l, true)).
// Returns update(clock, riding) to run the carriers (clock = lift time in seconds; each lift has run
// clock × its speed along its map route, and the 3D cable, longer for its slope and sag, proportionally further) (hiding the one the player would overlap) and
// ride(lift, fraction, pos, dir) to place a rider on the up line; ride() returns the lift type.
export function buildLifts(scene, lifts, ground, pal, surface = ground) {
  const towers = [], arms = [], cables = [], lines = [], upLine = new Map();
  const carriers = { chair_lift: [], gondola: [], cable_car: [], platter: [] };
  for (const l of lifts) {
    const P = l.points.map(([x, y]) => [x, y, ground(x, y)]);
    if (l.type === 'magic_carpet') { scene.add(carpetMesh(l, surface, pal)); continue; }
    const kind = LIFT[l.type] ? l.type : DRAG_LIFTS.has(l.type) ? 'platter' : 'chair_lift', spec = LIFT[kind];
    // Sideways direction at each support: the average of the spans either side, in world x/y.
    const side = P.map((_, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      return [dy / L, -dx / L];
    });
    const ends = [0, P.length - 1], stationH = spec.station[2] - 1;
    for (const lane of spec.gauge ? [1, -1] : [1]) {
      const supports = P.map(([x, y, z], i) => v3(x + side[i][0] * spec.gauge * lane, y + side[i][1] * spec.gauge * lane, z + (ends.includes(i) ? stationH : spec.tower)));
      const c = cablePath(lane > 0 ? supports : supports.reverse(), spec.sag);
      if (lane > 0) upLine.set(l.id, { cable: c, type: kind });
      cables.push(c); lines.push(...c.pts.flatMap((p, i) => i ? [c.pts[i - 1], p] : []));
      if (spec.every < Infinity) carriers[kind].push({ cable: c, every: spec.every, rate: liftSpeed(l.type) * c.length / l.length });
      else carriers[kind].push({ cable: c, every: c.length, rate: liftSpeed(l.type) * c.length / l.length, shuttle: true });
    }
    // Towers on every middle node, with a crossarm carrying both lines. A drag lift's tower stands
    // DRAG_ARM metres to the side of the track, its arm reaching out over it, so riders pass beside it.
    for (let i = 1; i < P.length - 1; i++) {
      const [x, y, z] = P[i], yaw = Math.atan2(side[i][1], side[i][0]), w = spec.tower > 20 ? 2 : spec.tower > 8 ? .7 : .35;
      if (spec.gauge) {
        towers.push({ x, y, z, h: spec.tower, w });
        arms.push({ x, y, z: z + spec.tower, yaw, len: spec.gauge * 2 + 1 });
      } else {
        const [sx, sy] = side[i], tx = x + sx * DRAG_ARM, ty = y + sy * DRAG_ARM;
        towers.push({ x: tx, y: ty, z: Math.min(z, ground(tx, ty)), h: spec.tower + Math.max(0, z - ground(tx, ty)), w });
        arms.push({ x: x + sx * DRAG_ARM / 2, y: y + sy * DRAG_ARM / 2, z: z + spec.tower, yaw, len: DRAG_ARM + .4 });
      }
    }
    // Stations at both ends: an open shed on four pillars (skiers pass under it), set back past the
    // end of the line, with the bullwheel under the roof and a control cabin to one side.
    for (const i of ends) {
      const [x, y, z] = P[i], [ox, oy] = P[i ? i - 1 : 1], out = Math.atan2(y - oy, x - ox);
      const [len, wide, tall] = spec.station, g = new THREE.Group(), cx = len / 2 - 3;
      const add = (geo, color, px, py, pz) => { const m = new THREE.Mesh(geo, mat(color)); m.position.set(px, py, pz); g.add(m); };
      if (spec.gauge) {
        for (const [px, pz] of [[cx - len / 2 + .5, -wide / 2], [cx - len / 2 + .5, wide / 2], [cx + len / 2 - .5, -wide / 2], [cx + len / 2 - .5, wide / 2]])
          add(new THREE.BoxGeometry(.6, tall + 1, .6), pal.stone, px, tall / 2 - .5, pz);
        add(new THREE.BoxGeometry(len, .7, wide + .6), pal.roof, cx, tall + .1, 0);
        add(new THREE.BoxGeometry(len + .4, .3, wide + 1), pal.roofSnow, cx, tall + .55, 0);
        add(new THREE.CylinderGeometry(spec.gauge, spec.gauge, .3, 16), pal.lift, cx, stationH, 0);
      }
      const hut = spec.gauge ? wide / 2 + 3 : 3;
      add(new THREE.BoxGeometry(3, 2.6, 3), pal.wall, cx, .8, hut);
      add(new THREE.BoxGeometry(3.6, .4, 3.6), pal.roofSnow, cx, 2.3, hut);
      g.position.copy(v3(x, y, z)); g.rotation.y = out;
      scene.add(g);
    }
  }

  // Towers and crossarms as instanced boxes.
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const towerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(pal.lift), towers.length);
  towers.forEach((t, i) => towerMesh.setMatrixAt(i, m.compose(v3(t.x, t.y, t.z + t.h / 2 - 1), q.identity(), s.set(t.w, t.h + 2, t.w))));
  const armMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(pal.lift), arms.length);
  arms.forEach((a, i) => armMesh.setMatrixAt(i, m.compose(v3(a.x, a.y, a.z), q.setFromAxisAngle(up, a.yaw), s.set(a.len, .35, .35))));
  scene.add(towerMesh, armMesh);
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: pal.lift })));

  // Carriers: one instanced mesh per type, moved along their cables every frame.
  const colors = { chair_lift: pal.lift, gondola: pal.roof, cable_car: pal.roof, platter: pal.lift };
  const fleets = Object.entries(carriers).filter(([, list]) => list.length).map(([type, list]) => {
    const count = list.reduce((n, c) => n + (c.shuttle ? 1 : Math.max(1, Math.round(c.cable.length / c.every))), 0);
    const mesh = new THREE.InstancedMesh(carrierGeometry(type), mat(colors[type]), count);
    mesh.frustumCulled = false; scene.add(mesh);
    return { mesh, list };
  });
  const pos = new THREE.Vector3(), dir = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const ride = (lift, f, out, outDir) => {
    const u = upLine.get(lift.id); if (!u) return null;
    sampleCable(u.cable, f * u.cable.length, out, outDir);
    return { type: u.type, cable: u.cable, d: f * u.cable.length };
  };
  const hidden = new THREE.Vector3(0, 0, 0);
  function update(clock, riding) {
    for (const { mesh, list } of fleets) {
      let k = 0;
      for (const c of list) {
        // Carriers spaced evenly round the loop (about `every` apart), so the spacing holds where the line wraps.
        const L = c.cable.length, cr = clock * c.rate, n = Math.max(1, Math.round(L / c.every)), gap = L / n;
        // The line the player rides is shifted so one of its carriers is exactly the player's: even gaps
        // ahead and behind. The shift is kept after getting off, so nothing jumps then.
        if (riding && riding.cable === c.cable && !c.shuttle) c.phase = ((riding.d - cr) % gap + gap) % gap;
        // A cable car shuttles: up one line while its twin comes down the other, pausing at each end.
        const ds = c.shuttle ? [L * THREE.MathUtils.smoothstep(Math.abs(((cr / L) % 2) - 1) * 1.2 - .1, 0, 1)]
          : Array.from({ length: n }, (_, j) => (cr + (c.phase || 0) + j * gap) % L);
        for (const d of ds) {
          sampleCable(c.cable, d, pos, dir);
          q.setFromAxisAngle(up, Math.atan2(-dir.z, dir.x));
          // The player's own carrier is drawn separately; drop any chair it would pass through.
          const clash = riding && riding.cable === c.cable && Math.abs(d - riding.d) < Math.min(gap, 40) / 2;
          mesh.setMatrixAt(k++, m.compose(pos, q, clash ? hidden : one));
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return { update, ride };
}

// A conveyor belt draped on the snow: sampled every 2 m so it follows every bump, its top CARPET_TOP above
// the drawn snow surface (where the rider stands), with side skirts reaching below it so no gap shows.
export const CARPET_TOP = .25;
function carpetMesh(l, ground, pal) {
  const half = .6, pos = [], idx = [];
  for (let d = 0, n = Math.ceil(l.length / 2); d <= n; d++) {
    const { position: [x, y], tangent: [tx, ty] } = sampleRoute(l, Math.min(l.length, d * 2));
    const g = ground(x, y), k = pos.length / 3;
    // Four points across: left skirt foot, left top, right top, right skirt foot.
    for (const [o, z] of [[-half, g - .3], [-half, g + CARPET_TOP], [half, g + CARPET_TOP], [half, g - .3]]) pos.push(...v3(x + ty * o, y - tx * o, z).toArray());
    if (d) for (let j = 0; j < 3; j++) idx.push(k - 4 + j, k + j, k - 3 + j, k - 3 + j, k + j, k + 1 + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: pal.lift, side: THREE.DoubleSide }));
}

// Buildings extruded from their real footprints (shape from buildingShape: OSM outline; height, roof and
// materials from IGN BD TOPO where matched). Flat and pitched roofs alike carry snow. All buildings are
// merged into one mesh coloured per vertex.
export function buildBuildings(scene, buildings, ground, pal, gradient) {
  const C = c => new THREE.Color(c), mix = (a, b, t) => C(a).lerp(C(b), t);
  const WALL = { stone: C(pal.stone), wood: C(pal.wall), concrete: mix(pal.stone, pal.snow[0], .55), render: mix(pal.wall, pal.snow[0], .7), shed: C(pal.wallDark) };
  const ROOF = { tile: C(pal.roof), slate: mix(pal.stone, pal.ink, .45), metal: mix(pal.stone, pal.leaf[1], .35), concrete: C(pal.stone) };
  const snow = C(pal.roofSnow);
  const pos = [], col = [];
  const tri = (a, b, c, k) => { for (const p of [a, b, c]) { pos.push(p[0], p[2], -p[1]); col.push(k.r, k.g, k.b); } };
  // Wall strip between two heights at each end of edge a → b (heights absolute).
  const strip = (a, b, a0, b0, a1, b1, k) => {
    if (a1 - a0 < .01 && b1 - b0 < .01) return;
    tri([a[0], a[1], a0], [b[0], b[1], b0], [b[0], b[1], b1], k); tri([a[0], a[1], a0], [b[0], b[1], b1], [a[0], a[1], a1], k);
  };
  for (const b of buildings) {
    const s = buildingShape(b, gradient), { ring, h } = s;
    // Sit on the lowest corner so the downhill side never floats.
    const base = Math.min(...ring.map(p => ground(p[0], p[1]))) - .5, eave = base + .5 + h;
    const top = p => eave + s.lift(p);
    const wall = WALL[s.wall] || WALL.wood, plinth = s.plinth ? WALL.stone : null, roofCol = ROOF[s.roof] || ROOF.tile;
    const glass = wall.clone().multiplyScalar(.45);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const tp = top(p), tq = top(q), gp = ground(p[0], p[1]), gq = ground(q[0], q[1]);
      // Stone plinth up to 2.4 m above the local ground, wall, then a 0.5 m eave band in the roof colour.
      const sp = plinth ? Math.min(gp + 2.4, tp - .5) : base, sq = plinth ? Math.min(gq + 2.4, tq - .5) : base;
      if (plinth) strip(p, q, base, base, sp, sq, plinth);
      strip(p, q, sp, sq, tp - .5, tq - .5, wall);
      strip(p, q, tp - .5, tq - .5, tp, tq, roofCol);
      // A darker window row on each floor above the ground, on walls long enough to have windows.
      if (L < 4 || !s.windows) continue;
      const ox = (q[1] - p[1]) / L * .08, oy = -(q[0] - p[0]) / L * .08, inset = Math.min(1, L / 5);
      const a = [p[0] + (q[0] - p[0]) * inset / L + ox, p[1] + (q[1] - p[1]) * inset / L + oy];
      const c = [q[0] - (q[0] - p[0]) * inset / L + ox, q[1] - (q[1] - p[1]) * inset / L + oy];
      const fh = h / s.floors;
      for (let f = 0; f < s.floors; f++) {
        const z0 = eave - h + f * fh + fh * .35, z1 = z0 + fh * .38;
        if (z0 < Math.max(gp, gq) + .3) continue; // buried on the uphill side
        strip(a, c, z0, z0, z1, z1, glass);
      }
    }
    // Roof faces triangulated inside the outline.
    for (const poly of s.faces) {
      const faces = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const [i, j, k] of faces) {
        const [A, B, D] = [poly[i], poly[j], poly[k]].map(p => [p[0], p[1], top(p) + .05]);
        // Make every roof triangle face up.
        if ((B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]) > 0) tri(A, B, D, snow); else tri(A, D, B, snow);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}

// Piste-edge poles every 30 m on both sides, in each piste's difficulty colour. onPiste(x, y) says whether
// a spot is on any piste or plaza: a pole there would stand in the middle of a crossing piste, so it is left out.
export function buildPoles(scene, trails, ground, pal, onPiste) {
  const poles = [];
  for (const r of trails) {
    if (r.kind === 'connection') continue;
    const color = new THREE.Color(pal.trail[r.difficulty] || pal.trail.unknown);
    for (let d = 15; d < r.length - 10; d += 30) {
      const { position: [x, y], tangent: [tx, ty] } = sampleRoute(r, d), w = widthAt(r, d) / 2 + 1;
      // Tested 2 m further out, past the blur of this piste's own edge in the 2 m-per-pixel mask.
      for (const k of [-1, 1]) if (!onPiste(x + ty * k * (w + 2), y - tx * k * (w + 2))) poles.push([x + ty * k * w, y - tx * k * w, color]);
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, 2, .25), mat('#ffffff'), poles.length), m = new THREE.Matrix4();
  poles.forEach(([x, y, c], i) => { mesh.setMatrixAt(i, m.makeTranslation(x, ground(x, y) + 1, -y)); mesh.setColorAt(i, c); });
  scene.add(mesh);
}

// Pines from the 2D game's own tree tiles (same OSM forests, same spots), refreshed around the
// camera whenever it moves into another tile. Returns update(x, y).
export function buildForest(scene, tiles, tileM, ground, pal, radius = 650) {
  const MAX = 24000;
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 8, 6), new THREE.MeshLambertMaterial({ color: pal.leaf[1], flatShading: true }), MAX);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.35, .35, 1.5, 5), mat(pal.trunk), MAX);
  crowns.count = trunks.count = 0; crowns.frustumCulled = trunks.frustumCulled = false; scene.add(crowns, trunks);
  const m = new THREE.Matrix4();
  let at = null;
  return function update(x, y) {
    const tx = Math.floor(x / tileM), ty = Math.ceil(y / tileM), key = tx + ',' + ty;
    if (key === at) return;
    at = key;
    const n = Math.ceil(radius / tileM);
    let k = 0;
    for (let j = ty - n; j <= ty + n; j++) for (let i = tx - n; i <= tx + n; i++) {
      if (Math.hypot((i + .5) * tileM - x, (j - .5) * tileM - y) > radius + tileM) continue;
      for (const t of tiles.trees(i, j)) {
        if (k >= MAX) break;
        // Size varies per tree but is fixed by its position, so trees never change on refresh.
        const s = (t.kind === 'pineSmall' ? .65 : 1) * (.85 + ((t.x * 12.9898 + t.y * 78.233) % 1 + 1) % 1 * .35), z = ground(t.x, t.y);
        crowns.setMatrixAt(k, m.makeScale(s, s, s).setPosition(t.x, z + 5 * s, -t.y));
        trunks.setMatrixAt(k, m.makeScale(s, s, s).setPosition(t.x, z + .75 * s, -t.y));
        k++;
      }
    }
    crowns.count = trunks.count = k;
    crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true;
  };
}
