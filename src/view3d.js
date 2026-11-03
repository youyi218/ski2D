// The over-the-shoulder 3D view: the same mountain, skier and lifts the 2D game simulates, drawn
// with Three.js. game.js owns the simulation; this only reads its state each frame and draws it.
// World: x east, y north, z altitude (metres). Three.js is y-up, so world (x, y, z) → (x, z, −y).
import * as THREE from 'three';
import { heightAt, sampleRoute } from './core.js';
import { buildLifts, buildBuildings, buildPoles, buildForest, carrierGeometry, CARPET_TOP } from './world3d.js';

const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Largest lean (radians) at each speed (km/h): none below 40, about 20° from 40, about 40° from 70.
const LEAN_TIERS = [[70, .7], [40, .35]];
const leanCap = kmh => LEAN_TIERS.find(([from]) => kmh >= from)?.[1] ?? 0;
// How far the camera turns from the skier's heading toward the fall line: a little going downhill,
// more the further the skier points across or up the slope.
const CAM_DOWNHILL = [.25, .6];
// On a piste the pull only starts once the skier turns away from the piste's direction (radians):
// none within CAM_ALIGNED[0], full from CAM_ALIGNED[1]. Skiing straight down a run that tilts
// sideways keeps the camera dead behind.
const CAM_ALIGNED = [.25, .7];
// Where the rider sits relative to the grip on the cable, per lift type (metres down); null = inside a cabin.
const SEAT_DROP = { chair_lift: 2.7, gondola: null, cable_car: null };

// Snow close up, faded out with distance so it never shimmers: groomer corduroy with a seam every
// 4 m pass on pistes, stretched wind ripples and grain off-piste, and slow broad patches everywhere.
const GROUND_DETAIL = /* glsl */ `
  uniform sampler2D pisteMask;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float snowDetail(vec2 w, vec2 uv, float dist) {
    vec4 m = texture2D(pisteMask, uv);
    vec2 dir = m.gb * 2. - 1.; float dl = length(dir); dir = dl > .2 ? dir / dl : vec2(1, 0);
    float across = dot(w, vec2(-dir.y, dir.x)), along = dot(w, dir);
    float cord = 1. - .07 * step(.5, fract(across / .5)) - .1 * step(fract(across / 4.), .06)
      + (vnoise(vec2(across * .8, along * .08)) - .5) * .05;
    vec2 q = w + vec2(vnoise(w * .03), vnoise(w * .03 + 7.)) * 25.;
    float wild = 1. + (vnoise(q * vec2(.25, 1.4)) - .5) * .2 + (vnoise(w * 2.2) - .5) * .09;
    float near = 1. - smoothstep(20., 110., dist);
    float broad = 1. + (vnoise(w * .02) - .5) * .06 + (vnoise(w * .09) - .5) * .04 * (1. - smoothstep(150., 600., dist));
    return mix(1., mix(wild, cord, m.r), near) * broad;
  }
`;

// opts: terrain, trails, lifts (bottom → top), scenery, masks + frame (the game's whole-map masks:
// R edge, G piste, B forest at frame resolution), tiles (GroundTiles, for trees), tileM, pal,
// guide(x, y) → nearestPiste, trail + spray (the game's effect arrays), trailLife (s).
export function createView3D(opts) {
  const { terrain: T, trails, lifts, scenery, masks, frame, tiles, tileM, pal, guide, trail, spray, trailLife } = opts;
  const W = (T.cols - 1) * T.stepX, H = (T.rows - 1) * T.stepY;
  // Height of the drawn terrain mesh (a 20 m grid of triangles, see below), which can sit tens of
  // centimetres off ground() on curved slopes: things lying flat on the snow use this.
  const MESH = 20;
  const surface = (x, y) => {
    const fx = (x - T.minX) / MESH, fy = (y - T.minY) / MESH, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const h = (a, b) => ground(T.minX + (i + a) * MESH, T.minY + (j + b) * MESH);
    return u + v <= 1 ? h(0, 0) + u * (h(1, 0) - h(0, 0)) + v * (h(0, 1) - h(0, 0))
      : h(1, 1) + (1 - u) * (h(0, 1) - h(1, 1)) + (1 - v) * (h(1, 0) - h(1, 1));
  };
  const ground = (x, y) => heightAt(T, x, y);
  const gradient = (x, y) => [(ground(x + 20, y) - ground(x - 20, y)) / 40, (ground(x, y + 20) - ground(x, y - 20)) / 40];
  const maskAt = (x, y, ch) => { const [px, py] = frame.toPx(x, y), i = (Math.min(frame.h - 1, py | 0) * frame.w + Math.min(frame.w - 1, px | 0)) * 4; return masks[i + ch]; };

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const canvas = renderer.domElement; canvas.id = 'view3d';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe0ee');
  scene.fog = new THREE.Fog('#cfe0ee', 400, 2600);
  const camera = new THREE.PerspectiveCamera(60, 1, .3, 6000);
  scene.add(new THREE.HemisphereLight('#eaf2ff', '#8a8fa8', 1));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  sun.position.set(-.6, .55, .4).normalize(); // low sun from the south-west
  scene.add(sun);
  const mat = c => new THREE.MeshLambertMaterial({ color: c });

  // ---------- Ground ----------
  // Whole-map texture from the game's masks: snow, a greenish floor under forests, groomed pistes
  // and plazas, each piste edged in its difficulty colour.
  function bakeGround() {
    const mpp = Math.max(frame.w * 2 / 4096, W / frame.w), cw = Math.round(W / mpp), ch = Math.round(H / mpp);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'), img = g.createImageData(cw, ch), d = img.data;
    const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    const snow = rgb(pal.snow[0]), forest = rgb(pal.forestFloor[2]), groomed = rgb(pal.groomed[1]);
    const k = frame.w / cw, piste = new Uint8Array(cw * ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const o = ((j * k | 0) * frame.w + (i * k | 0)) * 4, col = masks[o + 2] > 120 ? forest : snow;
      piste[j * cw + i] = masks[o + 1] > 120;
      d.set(col, (j * cw + i) * 4); d[(j * cw + i) * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = g.lineJoin = 'round';
    for (const r of trails) {
      g.beginPath(); r.points.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](...frame.toPx(p[0], p[1]).map(v => v / k)));
      g.lineWidth = (r.width + 3) / mpp; g.strokeStyle = pal.trail[r.difficulty] || pal.trail.unknown; g.stroke();
    }
    const after = g.getImageData(0, 0, cw, ch);
    for (let i = 0; i < piste.length; i++) if (piste[i]) after.data.set(groomed, i * 4);
    g.putImageData(after, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  // Piste mask at ~5 m/px: r = groomed, g/b = the piste's direction (x, y mapped to 0…1) so the
  // shader runs the corduroy along each piste. Linear filtering softens the edges.
  function bakePisteMask() {
    const mpp = Math.max(1, W / 2048), c = document.createElement('canvas');
    c.width = Math.round(W / mpp); c.height = Math.round(H / mpp);
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(0,128,128)'; g.fillRect(0, 0, c.width, c.height);
    g.lineCap = 'round';
    const P = p => [(p[0] - T.minX) / mpp, (T.minY + H - p[1]) / mpp];
    for (const r of trails) for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      g.strokeStyle = `rgb(255,${Math.round(((b[0] - a[0]) / L * .5 + .5) * 255)},${Math.round(((b[1] - a[1]) / L * .5 + .5) * 255)})`;
      g.lineWidth = (r.width - 2) / mpp;
      g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke();
    }
    // Plazas and piste areas are groomed too (no direction: the shader falls back to east–west).
    const img = g.getImageData(0, 0, c.width, c.height);
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++)
      if (maskAt(T.minX + (i + .5) * mpp, T.minY + H - (j + .5) * mpp, 1) > 120) img.data[(j * c.width + i) * 4] = 255;
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }
  // Terrain mesh sampled every 20 m from the DEM.
  {
    const S = MESH, nx = Math.floor(W / S) + 1, ny = Math.floor(H / S) + 1;
    const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = T.minX + i * S, y = T.minY + j * S, k = j * nx + i;
      pos.set([x, ground(x, y), -y], k * 3);
      uv.set([(x - T.minX) / W, (y - T.minY) / H], k * 2);
    }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ map: bakeGround() }), mask = bakePisteMask();
    material.onBeforeCompile = shader => {
      shader.uniforms.pisteMask = { value: mask };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GROUND_DETAIL)
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= snowDetail(vec2(vWorld.x, -vWorld.z), vMapUv, length(vViewPosition));');
    };
    scene.add(new THREE.Mesh(geo, material));
  }

  // ---------- Lifts, buildings, poles, trees ----------
  const lifts3d = buildLifts(scene, lifts, ground, pal, surface);
  // Restaurants mapped only as a point get a small chalet; those inside a mapped building already have one.
  const pointHuts = scenery.restaurants.filter(r => !scenery.buildings.some(b => Math.hypot(b.x - r.x, b.y - r.y) < 15));
  buildBuildings(scene, [...scenery.buildings, ...pointHuts.map(r => ({ ...r, area: 150, use: 'shop' }))], ground, pal, gradient);
  buildPoles(scene, trails, ground, pal, (x, y) => maskAt(x, y, 1) > 120);
  const forest = buildForest(scene, tiles, tileM, ground, pal);
  // The player's own chair or cabin while riding (the shared carriers run at their own pace).
  const myCarrier = {};
  for (const type of ['chair_lift', 'gondola', 'cable_car']) {
    myCarrier[type] = new THREE.Mesh(carrierGeometry(type), mat(type === 'chair_lift' ? pal.lift : pal.roof));
    myCarrier[type].visible = false; scene.add(myCarrier[type]);
  }
  // On a drag lift: the player's own hanger, a bar from the grip on the cable down to a disc between the legs.
  const hanger = new THREE.Group(), hangerBar = new THREE.Mesh(new THREE.BoxGeometry(.04, 1, .04), mat(pal.lift));
  const gripPos = new THREE.Vector3(), gripDir = new THREE.Vector3(), toSkier = new THREE.Matrix4();
  const hangerDisc = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .08, 10), mat(pal.lift));
  const hangerCord = new THREE.Mesh(new THREE.BoxGeometry(.02, 1, .02), mat(pal.ink)), HANGER_BAR = 2.2;
  hanger.add(hangerBar, hangerCord, hangerDisc); hanger.visible = false; scene.add(hanger);
  // Places a unit-tall box so it spans a → b.
  const stretch = (m, a, b) => { const d = b.clone().sub(a), len = d.length() || 1e-3; m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(UP, d.divideScalar(len)); m.scale.y = len; };

  // ---------- The skier ----------
  // A small jointed rig built facing +x (x forward, y up, z to the skier's right). pose() places
  // the joints each frame and every bone is a box stretched between two of them.
  // `stance` yaws the skis across the slope for a hockey stop; `body` rolls the whole skier into turns.
  const skier = new THREE.Group(), stance = new THREE.Group(), body = new THREE.Group();
  skier.add(stance); stance.add(body); scene.add(skier);
  const part = (w, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), mat(c)); body.add(m); return m; };
  function bone(m, a, b) {
    const d = b.clone().sub(a), len = d.length() || 1e-3;
    m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(UP, d.divideScalar(len)); m.scale.y = len;
  }
  const pair = make => [make(), make()]; // [left, right]
  const rig = {
    skis: pair(() => {
      const g = new THREE.Group(), tip = new THREE.Mesh(new THREE.BoxGeometry(.2, .04, .09), mat(pal.ski));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, .04, .09), mat(pal.ski)).translateX(.05));
      tip.position.set(.92, .05, 0); tip.rotation.z = .45; g.add(tip);
      body.add(g); return g;
    }),
    boots: pair(() => part(.2, .14, pal.ink)), shins: pair(() => part(.13, .13, pal.pants)), thighs: pair(() => part(.16, .16, pal.pants)),
    hips: part(.24, .22, pal.pants), torso: part(.26, .42, pal.jacket),
    head: part(.22, .22, pal.skin), hat: part(.25, .25, pal.hat), goggles: part(.05, .08, pal.ink),
    upper: pair(() => part(.11, .11, pal.jacket)), fore: pair(() => part(.1, .1, pal.jacketDark)),
    hands: pair(() => part(.1, .1, pal.hat)), poles: pair(() => part(.03, .03, pal.stone)),
  };
  // Soft shadow under the skis, laid on the slope.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.75, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: pal.snow[4], transparent: true, opacity: .45, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  shadow.scale.set(1.5, 1, .8); scene.add(shadow);

  // p.crouch 0 (tall) → 1 (tuck); p.plow 0 → 1 (snowplough); p.lead −1…1 (which ski leads, + = left);
  // p.counter: angulation — the upper body rolled back toward the outside of the turn (radians),
  // p.knees: knees and hips driven into the turn (− = left); p.tuck 0 → 1;
  // p.push 0 → 1 with p.phase: skating off, each leg in turn pushing out and back while the other glides;
  // p.sit: seated on a chair (the origin is then 0.6 m below the seat);
  // p.drag: on a drag lift, the point on the bar the right hand holds (skier-local), p.dragDir the bar's
  // direction up toward the cable; the left hand then carries both poles.
  function pose(p) {
    const c = p.crouch, joints = [];
    // Skating: the right leg pushes while sin(phase) > 0, the left while it is < 0; the body rides over the gliding ski.
    const stroke = Math.sin(p.phase), shift = -stroke * .08 * p.push;
    for (const s of [0, 1]) {
      const side = s ? 1 : -1;
      // How far this leg is through its push (0 → 1 → 0), and whether it is on its way back in.
      const ext = Math.max(0, side * stroke) * p.push, back = ext * Math.max(0, -side * Math.cos(p.phase));
      const ski = rig.skis[s], x = p.sit ? .45 : -side * p.lead * .18, z = side * (.12 + p.plow * .14) + shift;
      let ankle, knee, hip;
      if (p.sit) { ankle = V(x, .15, z); knee = V(.42, .62, z * 1.1); hip = V(-.02, .6, side * .11); }
      else {
        const as = .3 + c * .55, at = .15 + c * 1.05;
        ankle = V(x, .12, z);
        knee = ankle.clone().add(V(Math.sin(as) * .42, Math.cos(as) * .42, -side * p.plow * .06 + p.knees * .14));
        hip = knee.clone().add(V(-Math.sin(at) * .44, Math.cos(at) * .44, 0)); hip.z = side * .11 + p.knees * .1 + shift;
        if (ext > 0) {
          // The pushing foot goes out and back with the leg straightening, then lifts as it comes back in;
          // the knee is found from the hip and the foot (two bones of about 0.43 m).
          ankle.add(V(-ext * .3, back * .14, side * ext * .42));
          const d = hip.clone().sub(ankle), L = Math.min(d.length(), .85);
          ankle.copy(hip).addScaledVector(d.normalize(), -L);
          const fwd = V(1, 0, 0).addScaledVector(d, -d.x).normalize();
          knee = ankle.clone().addScaledVector(d, L / 2).addScaledVector(fwd, Math.sqrt(Math.max(0, .43 * .43 - L * L / 4)));
        }
      }
      // Skis splay into a V while skating (tips out), the pushing one most; a snowplough turns them in.
      ski.position.set(ankle.x, ankle.y - .1, ankle.z);
      if (p.sit) ski.position.set(x, .1, z);
      ski.rotation.y = side * p.plow * .35 - side * (.2 * p.push + ext * .25);
      bone(rig.boots[s], V(ankle.x - .02, ankle.y - .09, ankle.z), ankle.clone().add(V(.03, .08, 0)));
      bone(rig.shins[s], ankle, knee); bone(rig.thighs[s], knee, hip);
      joints.push(hip);
    }
    const pelvis = joints[0].clone().add(joints[1]).multiplyScalar(.5);
    bone(rig.hips, joints[0], joints[1]);
    // Everything above the hips is laid out upright, then rolled about the pelvis by p.counter.
    const X = V(1, 0, 0), boneU = (m, a, b) => bone(m, a.clone().sub(pelvis).applyAxisAngle(X, p.counter).add(pelvis), b.clone().sub(pelvis).applyAxisAngle(X, p.counter).add(pelvis));
    const ab = p.sit ? .05 : .25 + c * .75 + p.tuck * .25;
    const spine = V(Math.sin(ab), Math.cos(ab), 0), chest = pelvis.clone().addScaledVector(spine, .58);
    boneU(rig.torso, pelvis.clone().addScaledVector(spine, -.05), chest);
    // The head stays more upright than the back, eyes down the hill.
    const look = V(spine.x * .45, 1, spine.z * .5).normalize(), neck = chest.clone().addScaledVector(look, .04), crown = neck.clone().addScaledVector(look, .26);
    boneU(rig.head, neck, crown); boneU(rig.hat, crown.clone().addScaledVector(look, -.08), crown.clone().addScaledVector(look, .04));
    const eyes = neck.clone().addScaledVector(look, .15).add(V(.12, 0, 0));
    boneU(rig.goggles, eyes.clone().add(V(0, 0, -.1)), eyes.clone().add(V(0, 0, .1)));
    for (const s of [0, 1]) {
      const side = s ? 1 : -1, shoulder = chest.clone().addScaledVector(spine, -.06).add(V(0, 0, side * .22));
      const swing = -side * stroke * p.push; // arms swing against the legs
      // Hands: out in front ready to plant, tucked in front of the face, swinging through a pole push, or on the lap.
      const hand = p.sit ? chest.clone().add(V(.38, -.42, side * .2)) : chest.clone().add(V(.38 + swing * .3, -.32 + p.tuck * .32, side * (.32 - p.tuck * .2)));
      const elbow = shoulder.clone().lerp(hand, .5).add(V(-.06 + p.tuck * .12, -.1 - p.tuck * .05, side * .07));
      boneU(rig.upper[s], shoulder, elbow); boneU(rig.fore[s], elbow, hand);
      const pd = (p.sit ? V(.2, -1, side * .1) : V(-.45 - p.tuck * .6 - swing * .3, -1 + p.tuck * .95, side * .14)).normalize(), handEnd = hand.clone().addScaledVector(pd, .07);
      boneU(rig.hands[s], hand.clone().addScaledVector(pd, -.05), handEnd);
      boneU(rig.poles[s], handEnd, hand.clone().addScaledVector(pd, 1.15));
    }
    if (p.drag) {
      const shoulder = side => chest.clone().addScaledVector(spine, -.06).add(V(0, 0, side * .22));
      // Left hand in front of the belly, both poles in its fist, trailing back and down past the hip.
      const left = chest.clone().add(V(.24, -.42, -.1)), ls = shoulder(-1), le = ls.clone().lerp(left, .5).add(V(-.08, -.1, -.1));
      boneU(rig.upper[0], ls, le); boneU(rig.fore[0], le, left);
      boneU(rig.hands[0], left.clone().add(V(0, 0, -.06)), left.clone().add(V(0, 0, .06))); // fist across both grips
      for (const s of [0, 1]) {
        const d = V(-.8, -.55, (s ? 1 : -1) * .07 - .1).normalize(), at = left.clone().add(V(0, 0, (s ? 1 : -1) * .035));
        boneU(rig.poles[s], at.clone().addScaledVector(d, -.12), at.clone().addScaledVector(d, 1.05));
      }
      // Right hand on the bar, elbow bent out to the side.
      const right = p.drag, rs = shoulder(1), re = rs.clone().lerp(right, .5).add(V(-.1, -.12, .14));
      boneU(rig.upper[1], rs, re); boneU(rig.fore[1], re, right);
      boneU(rig.hands[1], right.clone().addScaledVector(p.dragDir, -.06), right.clone().addScaledVector(p.dragDir, .06));
    }
  }
  const anim = { crouch: .2, plow: 0, lead: 0, counter: 0, knees: 0, tuck: 0, push: 0, phase: 0, stop: 0, stopSide: 1, sit: 0, drag: null, dragDir: V(0, 1, 0) };

  // ---------- Tracks and spray, drawn from the game's own effect arrays ----------
  const TRACK_MAX = 1200, SPRAY_MAX = 400;
  const tracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), TRACK_MAX);
  tracks.count = 0; tracks.frustumCulled = false; scene.add(tracks);
  const groove = new THREE.Color(pal.snow[3]), skidGroove = new THREE.Color(pal.snow[4]), snowCol = new THREE.Color(pal.snow[0]);
  const sprayPos = new Float32Array(SPRAY_MAX * 3);
  const sprayGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const sprayPts = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: pal.snow[2], size: .1 }));
  sprayPts.frustumCulled = false; scene.add(sprayPts);
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tc = new THREE.Color(), X1 = V(1, 0, 0);
  function drawEffects(now) {
    let k = 0;
    for (let i = 1; i < trail.length && k < TRACK_MAX - 1; i++) {
      const a = trail[i - 1], b = trail[i], age = (now - b.t) / trailLife;
      if (age >= 1 || Math.hypot(b.x - a.x, b.y - a.y) > 6) continue;
      const za = ground(a.x, a.y), zb = ground(b.x, b.y), along = v3(b.x - a.x, b.y - a.y, zb - za), len = along.length();
      tq.setFromUnitVectors(X1, along.normalize());
      tc.copy(b.skid ? skidGroove : groove).lerp(snowCol, age * age);
      for (const side of [-1, 1]) {
        const o = side * .22, ox = Math.sin(b.h) * o, oy = -Math.cos(b.h) * o;
        tracks.setMatrixAt(k, tm.compose(v3((a.x + b.x) / 2 + ox, (a.y + b.y) / 2 + oy, (za + zb) / 2 + .06), tq, ts.set(len + .1, 1, b.skid ? .28 : .12)));
        tracks.setColorAt(k++, tc);
      }
    }
    tracks.count = k; tracks.instanceMatrix.needsUpdate = true;
    if (tracks.instanceColor) tracks.instanceColor.needsUpdate = true;
    const n = Math.min(spray.length, SPRAY_MAX);
    for (let i = 0; i < n; i++) { const p = spray[spray.length - n + i]; sprayPos.set([p.x, ground(p.x, p.y) + p.z + .05, -p.y], i * 3); }
    sprayGeo.setDrawRange(0, n); sprayGeo.attributes.position.needsUpdate = true;
  }

  // ---------- Per frame ----------
  // `facing` is the heading as drawn: it follows the physics heading quickly when moving, but stands
  // still when the skier does (hands-off steering at a standstill can flick between two nearby
  // pistes) unless the player is turning on the spot.
  let lean = 0, lastHeading = null, cam = null, facing = null;
  const ridePos = new THREE.Vector3(), rideDir = new THREE.Vector3();

  // Over-the-shoulder camera: behind and a little right of `at` (three.js coords), facing `aim` (world radians).
  // Riding a lift it sits further back and higher (`ride`), so the chair doesn't fill the screen.
  function follow(at, aim, speed, dt, ride = false) {
    const fast = THREE.MathUtils.clamp(speed / 25, 0, 1);
    cam ||= { h: aim, pos: null };
    cam.h += wrap(aim - cam.h) * (1 - Math.exp(-dt * 3));
    const x = at.x, y = -at.z, z = at.y, fx = Math.cos(cam.h), fy = Math.sin(cam.h), back = ride ? 9 : 4.5 + fast * 2;
    const px = x - fx * back + fy * 1.1, py = y - fy * back - fx * 1.1;
    const pz = Math.max(z + (ride ? 4.5 : 2.2 + fast * .6), ground(px, py) + 1.5);
    // Smooth the offset from the skier, not the position, so the camera never falls behind at speed.
    const off = v3(px, py, pz).sub(at);
    cam.pos ? cam.pos.lerp(off, 1 - Math.exp(-dt * 10)) : (cam.pos = off);
    camera.position.copy(at).add(cam.pos);
    // Look 12 m ahead, but never at a point above the skier: uphill ground would tilt the view up into the slope.
    const ahead = ride ? 30 : 12, lz = ride ? z : Math.min(ground(x + fx * ahead, y + fy * ahead), z);
    camera.lookAt(v3(x + fx * ahead, y + fy * ahead, lz + 1));
    camera.fov = 60 + fast * 12; camera.updateProjectionMatrix();
  }

  // Switching views: fly between the follow camera (t = 1) and one looking straight down, framed like
  // the 2D map (t = 0; top: its centre, which way is up on screen, and metres from top to bottom).
  // The height moves on a log scale so the zoom feels even all the way down.
  const topCam = new THREE.PerspectiveCamera();
  function fromTop(top, t) {
    const e = t * t * (3 - 2 * t), z0 = ground(top.x, top.y);
    const h = top.height / 2 / Math.tan(camera.fov * Math.PI / 360);
    topCam.position.copy(v3(top.x, top.y, z0 + h));
    topCam.up.copy(v3(top.up[0], top.up[1], 0));
    topCam.lookAt(v3(top.x, top.y, z0));
    const low = Math.max(camera.position.y - z0, 1);
    camera.position.lerpVectors(topCam.position, camera.position, e);
    camera.position.y = z0 + h ** (1 - e) * low ** e;
    const q = camera.quaternion.clone();
    camera.quaternion.copy(topCam.quaternion).slerp(q, e);
  }

  function skiFrame(state, dt) {
    const sk = state.skier, input = state.input || {}, scale = state.simScale || 1;
    facing ??= sk.heading;
    facing += wrap(sk.heading - facing) * (1 - Math.exp(-dt * (sk.speed * 3 + (input.dir != null ? 6 : 0))));
    const rate = lastHeading === null ? 0 : wrap(facing - lastHeading) / Math.max(dt, 1e-6);
    lastHeading = facing;
    // Lean into the turn as far as the turn needs (tan θ = v·ω / g, ω in simulated time),
    // capped by speed tier: upright when slow, some lean from 40 km/h, more from 70 km/h.
    const needed = Math.atan(sk.speed * rate / scale / 9.81), maxLean = leanCap(sk.speed * 3.6);
    lean += (-THREE.MathUtils.clamp(needed, -maxLean, maxLean) - lean) * (1 - Math.exp(-dt * 8));
    // Pose targets: compress in turns, tuck, snowplough when braking slowly, hockey stop when fast,
    // skate when slow and pushing off.
    const ease = (k, to, r) => { anim[k] += (to - anim[k]) * (1 - Math.exp(-dt * r)); };
    const fastStop = input.brake && sk.speed > 9, plow = input.brake && !fastStop;
    if (fastStop && anim.stop < .05) anim.stopSide = Math.abs(lean) > .05 ? -Math.sign(lean) : 1;
    anim.sit = 0;
    ease('stop', fastStop ? 1 : 0, 6);
    ease('plow', plow ? 1 : 0, 8);
    ease('tuck', sk.tuck ? 1 : 0, 6);
    ease('crouch', sk.tuck ? 1 : Math.min(.65, .18 + Math.abs(rate / scale) * .45 + anim.stop * .35 + anim.plow * .1 + anim.push * .15), 6);
    ease('lead', THREE.MathUtils.clamp(rate / scale * .8, -1, 1), 6);
    // Angulation: the harder the lean, the more the legs carry it and the upper body stays level (a C shape).
    const angul = THREE.MathUtils.clamp((Math.abs(lean) - .15) / .5, 0, 1) * (1 - anim.tuck * .6);
    ease('counter', -lean * (.25 + angul * .75), 6);
    ease('knees', lean * angul, 6);
    ease('push', state.pushing ? 1 : 0, 4);
    anim.phase += dt * 5 * anim.push;
    pose(anim);

    const z = ground(sk.x, sk.y);
    skier.visible = shadow.visible = true;
    skier.position.copy(v3(sk.x, sk.y, z));
    skier.rotation.y = facing;
    stance.rotation.y = anim.stop * anim.stopSide * 1.2;
    // Roll into the turn; in a hockey stop lean back against the slide instead.
    body.rotation.x = lean * (1 - anim.stop) - anim.stop * anim.stopSide * .4;
    const [gx, gy] = gradient(sk.x, sk.y);
    shadow.position.copy(skier.position); shadow.quaternion.setFromUnitVectors(UP, V(-gx, 1, gy).normalize());
    shadow.rotateY(facing + stance.rotation.y);

    // Camera aim: the heading, pulled toward the fall line once the skier turns away from the piste
    // (or always, off-piste) so carving across the slope doesn't point it at the hillside.
    const g = guide(sk.x, sk.y);
    let aim = facing;
    if (sk.speed < .3 && input.dir == null) aim = cam?.h ?? facing; // standing still: hold the camera
    else {
      let pull = 1;
      if (g && g.dist < g.width / 2 + 10) pull = THREE.MathUtils.smoothstep(Math.abs(wrap(facing - Math.atan2(g.tangent[1], g.tangent[0]))), CAM_ALIGNED[0], CAM_ALIGNED[1]);
      if (pull > 0 && Math.hypot(gx, gy) > .03) {
        const toFall = wrap(Math.atan2(-gy, -gx) - aim);
        aim += toFall * pull * THREE.MathUtils.lerp(CAM_DOWNHILL[0], CAM_DOWNHILL[1], Math.min(1, Math.abs(toFall) / (Math.PI / 2)));
      }
    }
    follow(skier.position, aim, sk.speed, dt);
  }

  function liftFrame(state, dt) {
    const l = state.lift, f = state.liftD / l.length;
    const r = lifts3d.ride(l, f, ridePos, rideDir);
    const yaw = Math.atan2(-rideDir.z, rideDir.x);
    for (const m of Object.values(myCarrier)) m.visible = false;
    hanger.visible = false;
    lastHeading = null; facing = null; lean = 0;
    anim.stop = anim.plow = anim.tuck = anim.push = anim.counter = anim.knees = anim.lead = 0; anim.drag = null;
    body.rotation.x = 0; stance.rotation.y = 0;
    let at;
    if (r && r.type !== 'platter') {
      const carrier = myCarrier[r.type];
      carrier.visible = true; carrier.position.copy(ridePos); carrier.rotation.set(0, yaw, 0);
      const drop = SEAT_DROP[r.type];
      // On a chair the skier sits on the bench; in a cabin they ride inside, out of sight.
      skier.visible = drop !== null; shadow.visible = false;
      anim.sit = 1; pose(anim);
      skier.position.copy(ridePos).add(V(0, -(drop ?? 3), 0)); skier.rotation.y = yaw;
      at = ridePos.clone().add(V(0, -2, 0));
      lifts3d.update(state.liftClock, r);
    } else {
      // Drag lifts: standing on the skis, pulled up the track.
      // Magic carpet: standing upright on top of the belt.
      const { position: [x, y], tangent: [tx, ty] } = sampleRoute(l, state.liftD), carpet = l.type === 'magic_carpet';
      anim.sit = 0; anim.crouch = carpet ? 0 : .25;
      skier.visible = shadow.visible = true;
      // Stepped sideways in the track with ← → (state.liftSide metres to the rider's left); the bar follows.
      const off = carpet ? 0 : state.liftSide || 0, sx = x - ty * off, sy = y + tx * off;
      skier.position.copy(v3(sx, sy, carpet ? surface(x, y) + CARPET_TOP : ground(sx, sy))); skier.rotation.y = Math.atan2(ty, tx);
      if (!r) rideDir.set(tx, 0, -ty); // no cable to take the direction from
      shadow.position.copy(skier.position); shadow.quaternion.identity();
      at = skier.position;
      // The grip runs on the cable 3 m ahead; a cord reels out of it down to the top of the bar.
      const grip = r && lifts3d.ride(l, Math.min(1, (state.liftD + 3) / l.length), gripPos, gripDir);
      if (grip) {
        // The disc sits under the seat, between the thighs.
        const seat = skier.position.clone().add(V(-tx * .05, .55, ty * .05));
        // The bar: HANGER_BAR m long, leaning 45° forward (up between the legs, in front of the chest) and
        // tilted sideways toward the cable when the rider has stepped off the line.
        const toGrip = gripPos.clone().sub(seat).normalize(), fwd = V(tx, 0, -ty);
        const d = fwd.clone().add(UP).normalize().add(toGrip.clone().addScaledVector(fwd, -toGrip.dot(fwd)).setY(0)).normalize();
        const top = seat.clone().addScaledVector(d, HANGER_BAR);
        stretch(hangerBar, seat, top); stretch(hangerCord, top, gripPos);
        hangerDisc.position.copy(seat); hangerDisc.rotation.set(0, 0, 0);
        hanger.visible = true;
        // The right hand grips the bar about 1.15 m above the skis.
        const hold = seat.clone().addScaledVector(d, (1.15 - .55) / d.y);
        skier.updateMatrixWorld(true);
        anim.drag = skier.worldToLocal(hold); anim.dragDir.copy(d).transformDirection(toSkier.copy(skier.matrixWorld).invert());
      }
      pose(anim);
      lifts3d.update(state.liftClock, grip);
    }
    follow(at, Math.atan2(-rideDir.z, rideDir.x), 0, dt, true);
  }

  return {
    canvas,
    // Heading the camera faces (world radians), for the minimap wedge.
    get heading() { return cam?.h ?? 0; },
    // Where the skier is drawn facing; 3D steering turns relative to this, so it matches the screen.
    get facing() { return facing; },
    resize(pixel) {
      renderer.setPixelRatio(1 / pixel);
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    },
    render(state, dt) {
      if (state.mode === 'lift' && state.lift) liftFrame(state, dt);
      else if (state.skier) {
        for (const m of Object.values(myCarrier)) m.visible = false;
        hanger.visible = false; anim.drag = null;
        skiFrame(state, dt);
        lifts3d.update(state.liftClock, null);
      }
      if (state.top && state.camBlend < 1) fromTop(state.top, state.camBlend);
      forest(camera.position.x, -camera.position.z);
      drawEffects(state.t);
      renderer.render(scene, camera);
    },
    // A new run or a teleport: snap the camera instead of swinging it across the map.
    reset() { cam = null; lastHeading = null; facing = null; },
    dispose() {
      scene.traverse(o => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m?.map?.dispose(); m?.dispose(); }); });
      renderer.dispose(); canvas.remove();
    },
  };
}
