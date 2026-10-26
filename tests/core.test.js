import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRoute, roundCorners, sampleRoute, heightAt, widthAt, widthIntervals, buildPisteIndex, nearestPiste, createSkier, stepSkier } from '../src/core.js';

const trail = { id: 'a', name: 'Test', difficulty: 'blue', points: [[0, 0, 200], [0, 100, 150], [100, 100, 100]] };

test('route distances and downhill orientation survive reversed source geometry and duplicates', () => {
  const r = prepareRoute({ ...trail, points: [[100, 100, 100], [0, 100, 150], [0, 100, 150], [0, 0, 200]] });
  assert.equal(r.length, 200);
  assert.deepEqual(sampleRoute(r, 50).position, [0, 50, 175]);
  assert.deepEqual(sampleRoute(r, 999).position, [100, 100, 100]);
  assert.equal(r.drop, 100);
});

test('terrain bilinear sampling clamps edges and interpolates real elevation grid', () => {
  const t = { cols: 2, rows: 2, minX: 0, minY: 0, stepX: 10, stepY: 10, heights: [100, 120, 140, 160] };
  assert.equal(heightAt(t, 5, 5), 130);
  assert.equal(heightAt(t, -10, 20), 140);
});

// A plane sloping down toward +y (north): z = -0.3 * y.
const plane = { gradient: () => [0, -.3], surface: () => 'piste' };

test('widths: default, sections and intervals', () => {
  const r = prepareRoute({ ...trail, width: 45, widthSections: [[0, .25, 20]] });
  assert.equal(widthAt(r, 10), 20);
  assert.equal(widthAt(r, 150), 45);
  assert.deepEqual(widthIntervals(r).map(i => [i.d0, i.d1, i.width]), [[0, 50, 20], [50, 200, 45]]);
});

test('nearest piste finds the closest centreline and distance along it', () => {
  const r = prepareRoute({ ...trail, width: 45 });
  const idx = buildPisteIndex([r]);
  const n = nearestPiste(idx, 10, 50);
  assert.equal(n.route.id, 'a');
  assert.equal(Math.round(n.dist), 10);
  assert.equal(Math.round(n.d), 50);
  assert.equal(nearestPiste(idx, 5000, 5000), null);
});

test('hands-off: points down the fall line and accelerates; brakes to a halt', () => {
  const sk = createSkier(0, 0, 0); // facing east on a slope that falls to the north
  for (let i = 0; i < 180; i++) stepSkier(sk, {}, plane, 1 / 60);
  assert.ok(Math.abs(sk.heading - Math.PI / 2) < .2 && sk.speed > 2 && sk.y > 1);
  for (let i = 0; i < 240; i++) stepSkier(sk, { brake: true }, plane, 1 / 60);
  assert.equal(sk.speed, 0);
});

test('turning toward a wanted direction is gradual, not a flip', () => {
  const sk = createSkier(0, 0, Math.PI / 2); sk.speed = 15;
  stepSkier(sk, { dir: -Math.PI / 2 }, plane, 1 / 60);
  assert.ok(Math.abs(sk.heading - Math.PI / 2) < .05);           // one frame: barely turned
  for (let i = 0; i < 60; i++) stepSkier(sk, { dir: -Math.PI / 2 }, plane, 1 / 60);
  const turned = Math.abs(sk.heading - Math.PI / 2);
  assert.ok(turned > .2 && turned < 1, `turned ${turned}`);     // a second later: an easy arc, not a swing across
  for (let i = 0; i < 240; i++) stepSkier(sk, { dir: -Math.PI / 2 }, plane, 1 / 60);
  assert.ok(Math.abs(sk.heading - Math.PI / 2) > 1.5);           // keep holding: it does come round
});

test('climbing by pushing is slow', () => {
  const sk = createSkier(0, 0, -Math.PI / 2);
  for (let i = 0; i < 600; i++) stepSkier(sk, { dir: -Math.PI / 2 }, plane, 1 / 60);
  assert.ok(sk.speed > 0 && sk.speed < 1.5 && sk.y < 0);
});

test('holding a direction on the flat skates that way', () => {
  const flat = { gradient: () => [0, 0], surface: () => 'plaza' };
  const p = createSkier(0, 0, 0);
  for (let i = 0; i < 180; i++) stepSkier(p, { dir: Math.PI }, flat, 1 / 60);
  assert.ok(p.speed > .5 && p.x < 0);
});

test('forest caps speed; hands-off follows the piste; domain edge stops the skier', () => {
  const sk = createSkier(0, 0, Math.PI / 2); sk.speed = 15;
  stepSkier(sk, {}, { gradient: () => [0, -.5], surface: () => 'forest' }, 1 / 60);
  assert.ok(sk.speed <= 5);
  const g = createSkier(0, 0, Math.PI / 2 + .5); g.speed = 10;
  const env = { ...plane, guide: () => ({ dist: 0, width: 40, tangent: [0, 1] }) };
  for (let i = 0; i < 60; i++) stepSkier(g, {}, env, 1 / 60);
  assert.ok(Math.abs(g.heading - Math.PI / 2) < .3);
  const w = createSkier(0, 0, Math.PI / 2); w.speed = 10;
  stepSkier(w, {}, { ...plane, blocked: (x, y) => y > 0 }, 1 / 60);
  assert.equal(w.y, 0);
  assert.ok(w.speed <= 1.5);
});

test('roundCorners softens a right angle and keeps the ends', () => {
  const pts = roundCorners([[0, 0, 100], [100, 0, 90], [100, 100, 80]], 40);
  assert.deepEqual(pts[0], [0, 0, 100]);
  assert.deepEqual(pts.at(-1), [100, 100, 80]);
  assert.ok(pts.length > 3);
  assert.ok(!pts.some(p => p[0] === 100 && p[1] === 0));            // the sharp corner itself is gone
  const straight = roundCorners([[0, 0, 0], [50, 1, 0], [100, 0, 0]], 40);
  assert.equal(straight.length, 3);                                   // gentle bends are left alone
});

test('rejects malformed and degenerate routes rather than propagating NaN', () => {
  assert.throws(() => prepareRoute({ points:[[0,0,0],[0,0,0]] }), /route/i);
  assert.throws(() => prepareRoute({ points:[[0,0,0],[1,NaN,2]] }), /route/i);
});
