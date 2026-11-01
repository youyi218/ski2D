// Lifts and buildings for the 3D view, from the same resort data the 2D map uses.
// World: x east, y north, z altitude (metres); Three.js is y-up, so world (x, y, z) → (x, z, −y).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleRoute, widthAt } from './core.js';

const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);
const mat = c => new THREE.MeshLambertMaterial({ color: c });
// A box translated so its local position is `at` (used to assemble carriers from parts).
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// Per lift type: tower height, half the gap between the two cable lines, station size [long, wide, tall],
// carrier spacing and speed (m/s), and how deep the cable sags (fraction of the span).
const LIFT = {
  chair_lift: { tower: 10, gauge: 2.6, station: [14, 9, 5], every: 30, speed: 5, sag: .025 },
  gondola: { tower: 14, gauge: 3, station: [22, 11, 7], every: 70, speed: 6, sag: .025 },
  cable_car: { tower: 32, gauge: 4, station: [22, 13, 10], every: Infinity, speed: 10, sag: .045 },
  platter: { tower: 6, gauge: 0, station: [4, 3, 3], every: 14, speed: 3, sag: .01 },
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
// Returns update(seconds, riding) to run the carriers (hiding the one the player would overlap) and
// ride(lift, fraction, pos, dir) to place a rider on the up line; ride() returns the lift type.
export function buildLifts(scene, lifts, ground, pal) {
  const towers = [], arms = [], cables = [], lines = [], upLine = new Map();
  const carriers = { chair_lift: [], gondola: [], cable_car: [], platter: [] };
  for (const l of lifts) {
    const P = l.points.map(([x, y]) => [x, y, ground(x, y)]);
    if (l.type === 'magic_carpet') { // a conveyor belt lying on the snow
      for (let i = 1; i < P.length; i++) {
        const a = v3(...P[i - 1]).add(new THREE.Vector3(0, .15, 0)), b = v3(...P[i]).add(new THREE.Vector3(0, .15, 0));
        const m = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b), .3, 1.2), mat(pal.lift));
        m.position.copy(a).lerp(b, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
        scene.add(m);
      }
      continue;
    }
    const spec = LIFT[l.type] || LIFT.chair_lift;
    // Sideways direction at each support: the average of the spans either side, in world x/y.
    const side = P.map((_, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      return [dy / L, -dx / L];
    });
    const ends = [0, P.length - 1], stationH = spec.station[2] - 1;
    for (const lane of spec.gauge ? [1, -1] : [1]) {
      const supports = P.map(([x, y, z], i) => v3(x + side[i][0] * spec.gauge * lane, y + side[i][1] * spec.gauge * lane, z + (ends.includes(i) ? stationH : spec.tower)));
      const c = cablePath(lane > 0 ? supports : supports.reverse(), spec.sag);
      if (lane > 0) upLine.set(l.id, { cable: c, type: spec === LIFT[l.type] ? l.type : 'chair_lift' });
      cables.push(c); lines.push(...c.pts.flatMap((p, i) => i ? [c.pts[i - 1], p] : []));
      if (spec.every < Infinity) carriers[l.type]?.push({ cable: c, every: spec.every, speed: spec.speed });
      else carriers[l.type]?.push({ cable: c, every: c.length, speed: spec.speed, shuttle: true });
    }
    // Towers on every middle node, with a crossarm carrying both lines.
    for (let i = 1; i < P.length - 1; i++) {
      const [x, y, z] = P[i], yaw = Math.atan2(side[i][1], side[i][0]);
      towers.push({ x, y, z, h: spec.tower, w: spec.tower > 20 ? 2 : spec.tower > 8 ? .7 : .35 });
      if (spec.gauge) arms.push({ x, y, z: z + spec.tower, yaw, len: spec.gauge * 2 + 1 });
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
    const count = list.reduce((n, c) => n + (c.shuttle ? 1 : Math.floor(c.cable.length / c.every)), 0);
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
  function update(t, riding) {
    for (const { mesh, list } of fleets) {
      let k = 0;
      for (const c of list) {
        const L = c.cable.length;
        // A cable car shuttles: up one line while its twin comes down the other, pausing at each end.
        const ds = c.shuttle ? [L * THREE.MathUtils.smoothstep(Math.abs(((t * c.speed / L) % 2) - 1) * 1.2 - .1, 0, 1)]
          : Array.from({ length: Math.floor(L / c.every) }, (_, j) => (t * c.speed + j * c.every) % L);
        for (const d of ds) {
          sampleCable(c.cable, d, pos, dir);
          q.setFromAxisAngle(up, Math.atan2(-dir.z, dir.x));
          // The player's own carrier is drawn separately; drop any chair it would pass through.
          const clash = riding && riding.cable === c.cable && Math.abs(d - riding.d) < Math.min(c.every, 40) / 2;
          mesh.setMatrixAt(k++, m.compose(pos, q, clash ? hidden : one));
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return { update, ride };
}

// Houses and stations from the OSM footprints: walls, a pitched roof and snow on top, ridge along the slope's contour.
export function buildBuildings(scene, buildings, ground, pal, gradient) {
  // Triangular prism 1 × 1 × 1: ridge along x, apex at y = 1.
  const prism = new THREE.BufferGeometry();
  const P = [[-.5, 0, -.5], [-.5, 0, .5], [-.5, 1, 0], [.5, 0, -.5], [.5, 0, .5], [.5, 1, 0]];
  const tri = [0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 0, 3, 4, 0, 4, 1];
  prism.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap(i => P[i]), 3)); prism.computeVertexNormals();
  const n = buildings.length;
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff'), n);
  const two = c => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide });
  const roofs = new THREE.InstancedMesh(prism, two(pal.roof), n), snow = new THREE.InstancedMesh(prism, two(pal.roofSnow), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const wood = new THREE.Color(pal.wall), stone = new THREE.Color(pal.stone);
  buildings.forEach((b, i) => {
    const big = b.area > 400, side = Math.sqrt(b.area), len = big ? side * 1.3 : side * 1.15, wide = b.area / len;
    const [gx, gy] = gradient(b.x, b.y), yaw = Math.hypot(gx, gy) > .02 ? Math.atan2(gx, -gy) : (i * 2.4) % Math.PI;
    const h = big ? 9 : 5 + (i % 3), roofH = wide * (big ? .25 : .45);
    // Sit on the lowest corner so the downhill side never floats.
    const r = Math.hypot(len, wide) / 2, base = Math.min(ground(b.x, b.y), ground(b.x + r, b.y), ground(b.x - r, b.y), ground(b.x, b.y + r), ground(b.x, b.y - r)) - .5;
    q.setFromAxisAngle(up, yaw);
    walls.setMatrixAt(i, m.compose(v3(b.x, b.y, base + h / 2), q, s.set(len, h, wide)));
    walls.setColorAt(i, big ? stone : wood);
    roofs.setMatrixAt(i, m.compose(v3(b.x, b.y, base + h - .1), q, s.set(len + 1.2, roofH, wide + 1.6)));
    snow.setMatrixAt(i, m.compose(v3(b.x, b.y, base + h + .25), q, s.set(len + .8, roofH, wide + 1)));
  });
  scene.add(walls, roofs, snow);
}

// Piste-edge poles every 30 m on both sides, in each piste's difficulty colour.
export function buildPoles(scene, trails, ground, pal) {
  const poles = [];
  for (const r of trails) {
    if (r.kind === 'connection') continue;
    const color = new THREE.Color(pal.trail[r.difficulty] || pal.trail.unknown);
    for (let d = 15; d < r.length - 10; d += 30) {
      const { position: [x, y], tangent: [tx, ty] } = sampleRoute(r, d), w = widthAt(r, d) / 2 + 1;
      poles.push([x - ty * w, y + tx * w, color], [x + ty * w, y - tx * w, color]);
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
