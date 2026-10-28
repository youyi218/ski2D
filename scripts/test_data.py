#!/usr/bin/env python3
"""Validate the offline geography contract independently of browser rendering."""
import json, math, pathlib, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'data/resort.json').read_text())
SCENERY = json.loads((ROOT / 'data/scenery.json').read_text())
ISOLA = json.loads((ROOT / 'data/isola/resort.json').read_text())
length = lambda p: sum(math.dist(a[:2], b[:2]) for a, b in zip(p, p[1:]))


class GeographyTest(unittest.TestCase):
    def test_provenance(self):
        meta = DATA['meta']
        self.assertTrue(any(s.get('license') == 'ODbL 1.0' for s in meta['sources']))
        self.assertTrue(meta['osmSnapshotAt'])
        self.assertGreater(len(DATA['trails']), 80)
        self.assertGreater(len(DATA['lifts']), 20)

    def test_coordinates_and_direction(self):
        for kind in ['trails', 'lifts']:
            for r in DATA[kind]:
                p = r['points']
                self.assertGreaterEqual(len(p), 2)
                self.assertEqual(len(p), len(r['nodeIds']))
                self.assertTrue(all(len(v) == 3 and all(math.isfinite(n) for n in v) for v in p))
                self.assertTrue(all(650 < v[2] < 3200 for v in p))
                if kind == 'lifts':
                    self.assertLessEqual(p[0][2], p[-1][2])
                else:
                    self.assertIn(r['difficulty'], ['green', 'blue', 'red', 'black', 'connection', 'unknown'])
                    # OSM drawing direction is kept; it must not clearly climb.
                    self.assertLess(p[-1][2] - p[0][2], 25, r['name'])

    def test_topology_refers_to_real_positions(self):
        ids = {t['id']: t for t in DATA['trails']}
        for t in DATA['trails']:
            L = length(t['points'])
            for l in t['links']:
                self.assertIn(l['to'], ids)
                self.assertLessEqual(l['at'], L + 1)
                self.assertLessEqual(l['toAt'], length(ids[l['to']]['points']) + 1)
                self.assertIn(l['how'], ['node', 'gap', 'near', 'estimated'])
        for lift in DATA['lifts']:
            for e in lift['exits']:
                self.assertIn(e['to'], ids)
                self.assertLessEqual(e['gap'], DATA['meta']['liftLinkRadius'])

    def test_terrain_covers_routes(self):
        t = DATA['terrain']
        self.assertEqual(len(t['heights']), t['cols'] * t['rows'])
        for r in DATA['trails'] + DATA['lifts']:
            for x, y, z in r['points']:
                self.assertTrue(t['minX'] <= x <= t['minX'] + (t['cols'] - 1) * t['stepX'])
                self.assertTrue(t['minY'] <= y <= t['minY'] + (t['rows'] - 1) * t['stepY'])

    def test_known_routes(self):
        bouleaux = [t for t in DATA['trails'] if t['name'] == 'Bouleaux']
        self.assertTrue(bouleaux and all(t['difficulty'] == 'blue' for t in bouleaux))
        self.assertGreater(max(length(t['points']) for t in bouleaux), 1000)
        self.assertTrue(any(l['name'] == 'Bouleaux' for l in DATA['lifts']))

    def test_official_names_and_colours(self):
        fix = json.loads((ROOT / 'data/corrections.json').read_text())
        official = {**fix['officialPistes'], **fix['panoramaOnlyPistes']}
        names = set()
        for t in DATA['trails']:
            self.assertNotIn(t['name'], ['Sans nom', 'Liaison'])  # unnamed stays unnamed
            if t['kind'] != 'run' or not t['name']: continue
            self.assertIn(t['name'], official, t['name'])
            self.assertEqual(t['difficulty'], official[t['name']], t['name'])
            names.add(t['name'])
        self.assertEqual(names, set(official))  # every official piste is present (some hand-drawn)

    def test_every_lift_top_reaches_a_piste(self):
        for pl in [p for p in DATA['plazas'] if p['end'] == 'top']:
            gap = min(min(math.dist((pl['x'], pl['y']), q[:2]) for q in t['points']) - t['width'] / 2 for t in DATA['trails'])
            self.assertLess(gap, pl['r'] + 20, pl['lift'])
        self.assertEqual(len(DATA['lifts']), 24)  # official lift count
        self.assertEqual(len([t for t in DATA['trails'] if t['name'] == 'Bouleaux']), 1)

    def test_hand_drawn_are_marked(self):
        drawn = {t['name'] for t in DATA['trails'] if t.get('estimated') and not t.get('walkway')}
        self.assertEqual(drawn, {'Lupins', 'Ludette', 'Source', 'Stade', 'Stade slalom'})
        for t in DATA['trails']:
            self.assertEqual(bool(t.get('estimated')), not t['osmIds'])

    def test_scenery(self):
        self.assertGreater(len(SCENERY['forests']), 100)
        self.assertTrue(all(len(ring) >= 3 for f in SCENERY['forests'] for ring in f))


class IsolaTest(unittest.TestCase):
    def test_provenance_and_size(self):
        self.assertEqual(ISOLA['meta']['name'], 'Isola 2000')
        self.assertTrue(ISOLA['meta']['osmSnapshotAt'])
        self.assertGreater(len(ISOLA['trails']), 50)
        self.assertGreater(len(ISOLA['lifts']), 15)
        self.assertTrue(any(l['name'] == ISOLA['meta']['homeLift'] for l in ISOLA['lifts']))

    def test_geometry(self):
        t = ISOLA['terrain']
        self.assertEqual(len(t['heights']), t['cols'] * t['rows'])
        ids = {r['id'] for r in ISOLA['trails']}
        for r in ISOLA['trails'] + ISOLA['lifts']:
            p = r['points']
            self.assertEqual(len(p), len(r['nodeIds']))
            self.assertTrue(all(1700 < z < 2700 for _, _, z in p), r['name'])
            if r in ISOLA['lifts']: self.assertLessEqual(p[0][2], p[-1][2])
            else:
                self.assertLess(p[-1][2] - p[0][2], 25, r['name'])
                self.assertTrue(all(l['to'] in ids for l in r['links']))

    def test_every_lift_top_reaches_a_piste(self):
        for pl in [p for p in ISOLA['plazas'] if p['end'] == 'top']:
            gap = min(min(math.dist((pl['x'], pl['y']), q[:2]) for q in t['points']) - t['width'] / 2 for t in ISOLA['trails'])
            self.assertLess(gap, pl['r'] + 20, pl['lift'])


if __name__ == '__main__':
    unittest.main()
