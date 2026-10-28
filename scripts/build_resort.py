#!/usr/bin/env python3
"""Build offline resort data from OpenStreetMap + Terrarium DEM. Requires Pillow.

  python3 scripts/build_resort.py                  # Saint-Lary, rebuild from data/raw/v2
  python3 scripts/build_resort.py --resort isola   # Isola 2000, rebuild from data/isola/raw
  python3 scripts/build_resort.py --resort serre-chevalier
  python3 scripts/build_resort.py --fetch          # re-download OSM (Overpass) and DEM tiles first

Outputs resort.json (runs, lifts, terrain, topology) and scenery.json in the resort's data folder.
Its corrections.json is applied on top of OSM: where OSM and the official resort data disagree, the official data wins.
"""
import argparse, csv, json, math, pathlib, subprocess, collections
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
# One entry per resort. bbox = the OSM ski-area outline (landuse=winter_sports), padded.
RESORTS = {
    'saint-lary': {
        'name': 'Saint-Lary-Soulan', 'scope': 'Domaine de Saint-Lary (OSM landuse=winter_sports way 962494483)',
        'dir': ROOT / 'data', 'raw': ROOT / 'data/raw/v2', 'osm': 'saint-lary.osm',
        'bbox': {'s': 42.805, 'w': 0.200, 'n': 42.855, 'e': 0.325}, 'origin': {'lat': 42.83, 'lon': 0.2625}, 'homeLift': 'Bouleaux',
    },
    'isola': {
        'name': 'Isola 2000', 'scope': 'Isola 2000 (OSM landuse=winter_sports way 23079840)',
        'dir': ROOT / 'data/isola', 'raw': ROOT / 'data/isola/raw', 'osm': 'isola.osm',
        'bbox': {'s': 44.165, 'w': 7.110, 'n': 44.210, 'e': 7.185}, 'origin': {'lat': 44.1875, 'lon': 7.1475}, 'homeLift': 'Mercantour',
    },
    'serre-chevalier': {
        'name': 'Serre Chevalier', 'scope': 'Serre Chevalier (OSM landuse=winter_sports way 599436073)',
        'dir': ROOT / 'data/serre-chevalier', 'raw': ROOT / 'data/serre-chevalier/raw', 'osm': 'serre-chevalier.osm',
        'bbox': {'s': 44.880, 'w': 6.475, 'n': 44.985, 'e': 6.640}, 'origin': {'lat': 44.9325, 'lon': 6.5575}, 'homeLift': 'TCD10 Pontillas',
    },
}
RESORT = RAW = BBOX = ORIGIN = COS = None  # set by use()
ZOOM = 13
GRID = 40  # terrain grid spacing, metres
# OSM does not link lifts to pistes: a piste counts as leaving a lift top (or reaching a lift bottom)
# when it passes within this many metres of the station. Change here and rebuild.
LIFT_LINK_RADIUS = 80
# Hand-drawn (estimated) pistes have no OSM nodes; their ends join pistes within this distance.
DRAWN_LINK_RADIUS = 60
# Geometry hygiene (see "Shape rules" in docs/data-sources.md).
SPIKE_ANGLE, SPIKE_SEGMENT = 120, 20        # drop a vertex turning more than this next to a segment shorter than this (m)
CORNER_APRON_ANGLE = 70                     # a piste bending more than this gets a round apron on the corner
JUNCTION_APRON_ANGLE = 100                  # a branch leaving more sharply than this gets a round apron at the fork
APRON_SCALE = .6                            # apron radius = this × the piste width there
LOOSE_END_RADIUS = 200                      # auto-connect a loose piste start/end to a piste within this distance (m)
# Piste widths (metres). Per-piste values come from data/piste-widths.csv.
DEFAULT_WIDTH = {'run': 45, 'connection': 18}
WIDTH_CLASSES = {'窄': 25, 'narrow': 25, '普通': 45, 'normal': 45, '宽': 70, 'wide': 70, '很宽': 100, 'very wide': 100}
# Flat skiable area around lift stations (radius in metres, by lift type).
PLAZA_RADIUS = {'gondola': 110, 'cable_car': 90, 'chair_lift': 80, 'platter': 45, 't-bar': 45, 'drag_lift': 45, 'magic_carpet': 30}
M = 111319.49079327358
UA = 'ski2D-prototype/0.1 (personal research)'
OVERPASS = 'https://overpass-api.de/api/interpreter'
TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
QUERY = """[out:xml][timeout:180][bbox:{s},{w},{n},{e}];
(
  way["piste:type"]; relation["piste:type"]; relation["route"="piste"];
  way["aerialway"]; node["aerialway"];
  way["landuse"="forest"]; way["natural"="wood"];
  relation["landuse"="forest"]; relation["natural"="wood"];
  way["building"];
  node["amenity"~"^(restaurant|cafe|bar)$"]; way["amenity"~"^(restaurant|cafe|bar)$"];
  node["natural"="peak"];
  way["landuse"="winter_sports"]; relation["landuse"="winter_sports"];
);
(._;>;);
out body;"""
DIFFICULTY = {'novice': 'green', 'easy': 'blue', 'intermediate': 'red', 'advanced': 'black', 'expert': 'black', 'freeride': 'black'}
LIFTS = {'chair_lift', 'gondola', 'cable_car', 'platter', 't-bar', 'j-bar', 'drag_lift', 'magic_carpet', 'rope_tow', 'mixed_lift'}


def use(slug):
    global RESORT, RAW, BBOX, ORIGIN, COS
    RESORT = RESORTS[slug]; RAW, BBOX, ORIGIN = RESORT['raw'], RESORT['bbox'], RESORT['origin']
    COS = math.cos(math.radians(ORIGIN['lat']))


def tile_xy(lat, lon, z=ZOOM):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def tile_range():
    x0, y0 = tile_xy(BBOX['n'], BBOX['w']); x1, y1 = tile_xy(BBOX['s'], BBOX['e'])
    return range(int(x0), int(x1) + 1), range(int(y0), int(y1) + 1)


def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl', '--fail', '-sS', '-A', UA, '--max-time', '200', OVERPASS, '--data-urlencode', 'data=' + QUERY.format(**BBOX), '-o', str(RAW / RESORT['osm'])], check=True)
    xs, ys = tile_range()
    for x in xs:
        for y in ys:
            subprocess.run(['curl', '--fail', '-sS', '-A', UA, '--max-time', '90', TILES.format(z=ZOOM, x=x, y=y), '-o', str(RAW / f'{ZOOM}-{x}-{y}.png')], check=True)


class DEM:
    def __init__(self):
        xs, ys = tile_range()
        self.px = {(x, y): Image.open(RAW / f'{ZOOM}-{x}-{y}.png').convert('RGB').load() for x in xs for y in ys}

    def __call__(self, lat, lon):
        tx, ty = tile_xy(lat, lon)
        px, py = tx * 256 - .5, ty * 256 - .5  # pixel-centre bilinear
        ix, iy = math.floor(px), math.floor(py); fx, fy = px - ix, py - iy
        def sample(x, y):
            r, g, b = self.px[(x // 256, y // 256)][x % 256, y % 256]
            return r * 256 + g + b / 256 - 32768
        return sum(sample(ix + dx, iy + dy) * (fx if dx else 1 - fx) * (fy if dy else 1 - fy) for dx in (0, 1) for dy in (0, 1))


def local(lat, lon):
    return [round((lon - ORIGIN['lon']) * M * COS, 1), round((lat - ORIGIN['lat']) * M, 1)]


def to_latlon(x, y):
    return ORIGIN['lat'] + y / M, ORIGIN['lon'] + x / (M * COS)


def seglen(pts):
    return sum(math.dist(a[:2], b[:2]) for a, b in zip(pts, pts[1:]))


def read_widths(path):
    """data/piste-widths.csv → {name: [(from, to, width_m), ...]} (later rows win)."""
    def frac(v, default):
        v = (v or '').strip()
        if not v: return default
        return float(v[:-1]) / 100 if v.endswith('%') else float(v)
    out = collections.defaultdict(list)
    lines = [l for l in path.read_text(encoding='utf-8').splitlines() if l.strip() and not l.lstrip().startswith('#')]
    for row in csv.DictReader(lines):
        name, w = (row.get('name') or '').strip(), (row.get('width') or '').strip()
        if not name or not w: continue
        width = WIDTH_CLASSES.get(w.lower(), None) or float(w)
        out[name].append((frac(row.get('from'), 0), frac(row.get('to'), 1), width))
    return out


def rings_from_relation(rel, ways):
    """Join a multipolygon's member ways into closed rings, keyed by role."""
    out = {'outer': [], 'inner': []}
    for role in out:
        segs = [list(ways[m.attrib['ref']]) for m in rel.findall('member') if m.attrib['type'] == 'way' and m.attrib.get('role', 'outer') == role and m.attrib['ref'] in ways]
        while segs:
            ring = segs.pop()
            while ring[0] != ring[-1]:
                for i, s in enumerate(segs):
                    if s[0] == ring[-1]: ring += s[1:]
                    elif s[-1] == ring[-1]: ring += s[-2::-1]
                    elif s[-1] == ring[0]: ring = s[:-1] + ring
                    elif s[0] == ring[0]: ring = s[:0:-1] + ring
                    else: continue
                    segs.pop(i); break
                else:
                    break  # unclosed ring: keep what we have
            out[role].append(ring)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--fetch', action='store_true')
    ap.add_argument('--resort', choices=RESORTS, default='saint-lary')
    args = ap.parse_args()
    use(args.resort)
    out = RESORT['dir']
    if args.fetch:
        fetch()
    dem = DEM()
    fix = json.loads((out / 'corrections.json').read_text())
    official = {**fix['officialPistes'], **fix['panoramaOnlyPistes']}
    def official_name(name):
        name = fix['pisteNameAliases'].get(name, name)
        return name, name
    xml = ET.parse(RAW / RESORT['osm']).getroot()
    osm_base = xml.find('meta').attrib.get('osm_base') if xml.find('meta') is not None else None
    nodes = {n.attrib['id']: (float(n.attrib['lat']), float(n.attrib['lon'])) for n in xml.findall('node')}
    node_tags = {n.attrib['id']: {t.attrib['k']: t.attrib['v'] for t in n.findall('tag')} for n in xml.findall('node') if n.find('tag') is not None}
    elev_cache = {}
    def elev(nid):
        if nid not in elev_cache: elev_cache[nid] = round(dem(*nodes[nid]), 1)
        return elev_cache[nid]
    point = lambda nid: local(*nodes[nid]) + [elev(nid)]
    tags_of = lambda el: {t.attrib['k']: t.attrib['v'] for t in el.findall('tag')}
    way_nodes, way_tags = {}, {}
    for w in xml.findall('way'):
        way_nodes[w.attrib['id']] = [n.attrib['ref'] for n in w.findall('nd') if n.attrib['ref'] in nodes]
        way_tags[w.attrib['id']] = tags_of(w)

    # Names/difficulty inherited from route=piste relations when the way itself lacks them.
    inherited = {}
    for rel in xml.findall('relation'):
        t = tags_of(rel)
        if t.get('route') == 'piste' or (t.get('type') == 'route' and 'piste:type' in t):
            for m in rel.findall('member'):
                if m.attrib['type'] == 'way': inherited.setdefault(m.attrib['ref'], t)

    # ---- Pistes: OSM convention draws downhill pistes in the direction of travel. ----
    segments, piste_areas, stats = [], [], collections.Counter()
    for wid, ids in way_nodes.items():
        t = {**inherited.get(wid, {}), **way_tags[wid]}
        ptype = t.get('piste:type')
        if ptype not in ('downhill', 'connection') or len(ids) < 2 or wid in fix['dropWays']:
            if wid in fix['dropWays']: stats['dropped'] += 1
            continue
        changes = []
        override = fix['ways'].get(wid, {})
        if 'difficulty' in override:
            t = {**t, 'piste:difficulty': None}
        if t.get('area') == 'yes' or (ids[0] == ids[-1] and ptype == 'downhill'):
            piste_areas.append([local(*nodes[n]) for n in ids[:-1]]); stats['area'] += 1
            continue
        diff = DIFFICULTY.get(t.get('piste:difficulty'))
        kind = 'connection' if ptype == 'connection' else 'run'
        if not diff:
            diff = 'connection' if kind == 'connection' else 'unknown'
        name = t.get('piste:name') or t.get('name') or ''
        osm_name, osm_diff = name, diff
        if 'name' in override: name = override['name']
        if 'difficulty' in override: diff = override['difficulty']
        name, entry = official_name(name)
        if kind == 'run' and entry in official: diff = official[entry]
        if name != osm_name: changes.append(f'name: {osm_name or "(none)"} → {name or "(none)"}')
        if diff != osm_diff: changes.append(f'difficulty: {osm_diff} → {diff}')
        if changes: stats['correctedWays'] += 1
        # Direction: trust OSM, but flag ways that clearly climb per the DEM.
        rise = elev(ids[-1]) - elev(ids[0])
        flagged = rise > 25 and not t.get('piste:oneway') == 'no'
        if flagged:
            stats['climbs_per_dem'] += 1
        segments.append({'wid': int(wid), 'name': name, 'difficulty': diff, 'kind': kind, 'ids': ids, 'grooming': t.get('piste:grooming'), 'demRise': round(rise), 'flag': flagged, 'changes': changes})

    # ---- Merge consecutive ways of one named piste (A.end == B.start, same name+difficulty, unambiguous). ----
    starts = collections.defaultdict(list); ends = collections.defaultdict(list)
    for i, s in enumerate(segments):
        starts[s['ids'][0]].append(i); ends[s['ids'][-1]].append(i)
    key = lambda s: (s['name'], s['difficulty'], s['kind'])
    def successor(i):
        c = [j for j in starts[segments[i]['ids'][-1]] if j != i and key(segments[j]) == key(segments[i])]
        return c[0] if len(c) == 1 and len([k for k in ends[segments[c[0]]['ids'][0]] if key(segments[k]) == key(segments[i])]) == 1 else None
    succ = {i: successor(i) for i in range(len(segments))}
    has_pred = {j for j in succ.values() if j is not None}
    runs, used = [], set()
    for i in range(len(segments)):
        if i in has_pred or i in used: continue
        chain = [i]
        while succ[chain[-1]] is not None and succ[chain[-1]] not in used and succ[chain[-1]] not in chain:
            chain.append(succ[chain[-1]])
        used.update(chain); runs.append(chain)
    for i in range(len(segments)):  # pure cycles
        if i not in used: used.add(i); runs.append([i])

    trails = []
    for chain in runs:
        segs = [segments[i] for i in chain]
        ids = segs[0]['ids'] + [n for s in segs[1:] for n in s['ids'][1:]]
        s0 = segs[0]
        trails.append({'id': f"run-{s0['wid']}", 'name': s0['name'], 'difficulty': s0['difficulty'], 'kind': s0['kind'],
                       'osmIds': [s['wid'] for s in segs], 'nodeIds': ids, 'points': [point(n) for n in ids],
                       'grooming': s0['grooming'], 'directionFlag': any(s['flag'] for s in segs),
                       'corrections': {str(s['wid']): s['changes'] for s in segs if s['changes']}})

    lifts = []
    for wid, ids in way_nodes.items():
        t = way_tags[wid]
        if t.get('aerialway') not in LIFTS or len(ids) < 2: continue
        if wid in fix['dropLifts']: stats['droppedLifts'] += 1; continue
        if elev(ids[0]) > elev(ids[-1]): ids = ids[::-1]  # lifts go up
        osm_name = t.get('name') or t['aerialway']
        name = fix['liftNames'].get(osm_name, osm_name)
        lifts.append({'id': f'lift-{wid}', 'name': name, 'osmName': osm_name, 'type': t['aerialway'], 'osmIds': [int(wid)],
                      'nodeIds': ids, 'points': [point(n) for n in ids]})

    def along(pts):
        c = [0.0]
        for a, b in zip(pts, pts[1:]): c.append(c[-1] + math.dist(a[:2], b[:2]))
        return c
    def project(p, pts, cum):
        best = (1e18, 0)
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy or 1e-9
            u = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
            d = math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1])
            if d < best[0]: best = (d, cum[i] + u * math.sqrt(L2))
        return best
    def sample(pts, f):
        cum = along(pts); d = f * cum[-1]
        i = max(0, min(len(pts) - 2, next((k for k in range(1, len(cum)) if cum[k] >= d), len(cum) - 1) - 1))
        a, b = pts[i], pts[i + 1]; seg = (cum[i + 1] - cum[i]) or 1e-9; u = (d - cum[i]) / seg
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg]

    # ---- Splits: one OSM way that the official panorama labels as two pistes. ----
    for name, rule in fix['splits'].items():
        for t in [t for t in trails if t['name'] == name]:
            other = {n for o in trails if o['name'] == rule['atJunctionWith'] for n in o['nodeIds']}
            i = next((k for k in range(1, len(t['nodeIds']) - 1) if t['nodeIds'][k] in other), None)
            if i is None: continue
            lower = {**t, 'id': t['id'] + '-2', 'name': rule['names'][1], 'nodeIds': t['nodeIds'][i:], 'points': t['points'][i:]}
            t.update(name=rule['names'][0], nodeIds=t['nodeIds'][:i + 1], points=t['points'][:i + 1])
            for part in (t, lower):
                part['corrections'] = {**part['corrections'], 'split': [f"{name} split at {rule['atJunctionWith']} → {part['name']}"]}
            trails.append(lower); stats['splits'] += 1

    # ---- Hand-drawn pistes: on the official panorama but not in OSM. Positions are estimates. ----
    def resolve(ref):
        if 'lift' in ref:
            return [p for p in next(l for l in lifts if l['name'] == ref['lift'])['points']]
        cands = [t for t in trails if t['name'] == ref['run']]
        if 'near' in ref:
            return min(cands, key=lambda t: min(math.dist(p[:2], ref['near']) for p in t['points']))['points']
        return max(cands, key=lambda t: along(t['points'])[-1])['points']
    for spec in fix['drawn']:
        pts = []
        if spec['method'] == 'offset':
            ref = resolve(spec['ref']); toward = resolve(spec['toward'])
            mid, _ = sample(ref, .5)
            dist = min(math.dist(mid, sample(toward, k / 50)[0]) for k in range(51))
            off = spec.get('offset') or spec['offsetFraction'] * dist
            (mx, my), (tx, ty) = sample(ref, .5)
            side = min((1, -1), key=lambda sg: min(math.dist((mx - ty * off * sg, my + tx * off * sg), sample(toward, k / 50)[0]) for k in range(51)))
            n = max(8, int(along(ref)[-1] * (spec['to'] - spec['from']) / 15))
            for k in range(n + 1):
                (x, y), (tx, ty) = sample(ref, spec['from'] + (spec['to'] - spec['from']) * k / n)
                f = k / n
                o = off * (min(1, (1 - f) / .3) if spec.get('taperEnd') else 1)  # rejoin the reference line at the end
                pts.append([x - ty * o * side, y + tx * o * side])
        else:  # between two lines, same fraction along each
            a, b = resolve(spec['a']), resolve(spec['b'])
            n = max(8, int(min(along(a)[-1], along(b)[-1]) / 15))
            for k in range(n + 1):
                f = spec['from'] + (spec['to'] - spec['from']) * k / n
                pa, pb = sample(a, f)[0], sample(b, f)[0]
                pts.append([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2])
        pts = [[round(x, 1), round(y, 1), round(dem(*to_latlon(x, y)), 1)] for x, y in pts]
        if pts[0][2] < pts[-1][2]: pts.reverse()
        slug = ''.join(c if c.isalnum() else '-' for c in spec['name'].lower())
        trails.append({'id': f'drawn-{slug}', 'name': spec['name'], 'difficulty': spec['difficulty'], 'kind': 'run',
                       'osmIds': [], 'nodeIds': [f'est-{slug}-{i}' for i in range(len(pts))], 'points': pts,
                       'grooming': None, 'directionFlag': False, 'estimated': True,
                       'corrections': {'drawn': [spec['why']]}})
        stats['drawn'] += 1

    # ---- Shape rule 1: drop spikes — a vertex that doubles back next to a very short segment
    # is a mapping slip, not a real piste shape. ----
    def turn_deg(a, b, c):
        x = math.atan2(b[1] - a[1], b[0] - a[0]); y = math.atan2(c[1] - b[1], c[0] - b[0])
        return abs(math.degrees(math.atan2(math.sin(y - x), math.cos(y - x))))
    for t in trails:
        i = 1
        while i < len(t['points']) - 1 and len(t['points']) > 2:
            a, b, c = t['points'][i - 1], t['points'][i], t['points'][i + 1]
            if turn_deg(a, b, c) > SPIKE_ANGLE and min(math.dist(a[:2], b[:2]), math.dist(b[:2], c[:2])) < SPIKE_SEGMENT:
                del t['points'][i]; del t['nodeIds'][i]; stats['spikesRemoved'] += 1
                t['corrections'] = {**t['corrections'], 'spikes': t['corrections'].get('spikes', []) + [f'removed a {round(turn_deg(a, b, c))}° spike']}
            else:
                i += 1

    # ---- Widths from data/piste-widths.csv. Fractions run top (0) → bottom (1) along the piste;
    # a piste in several pieces uses altitude instead (0 = its highest point, 1 = its lowest). ----
    widths = read_widths(out / 'piste-widths.csv')
    known = {t['name'] for t in trails}
    for name in widths:
        if name not in known: print(f'piste-widths.csv: unknown piste "{name}" (ignored)')
    for t in trails:
        t['width'] = DEFAULT_WIDTH[t['kind']]
        t['widthSections'] = []
        rows = widths.get(t['name']) if t['name'] else None
        if not rows: continue
        pieces = [o for o in trails if o['name'] == t['name']]
        if len(pieces) == 1:
            cum = along(t['points']); total = cum[-1] or 1
            fr = [c / total for c in cum]
        else:
            top = max(p[2] for o in pieces for p in o['points']); low = min(p[2] for o in pieces for p in o['points'])
            fr = [(top - p[2]) / ((top - low) or 1) for p in t['points']]
        for f0, f1, w in rows:
            if f0 <= 0 and f1 >= 1 and len(pieces) == 1: t['width'] = w; continue
            # Store as distance fractions of this run: first/last point inside [f0, f1].
            inside = [i for i, f in enumerate(fr) if f0 <= f <= f1]
            if not inside: continue
            cum = along(t['points']); total = cum[-1] or 1
            t['widthSections'].append([round(cum[inside[0]] / total, 4), round(cum[inside[-1]] / total, 4), w])
        stats['widthRows'] += 1

    # ---- Ski domain outline (landuse=winter_sports). The game unions it with a margin around every
    # piste and plaza, and treats everything outside as a wall, so nobody skis off into the valley. ----
    domain = []
    for wid, ids in way_nodes.items():
        if way_tags[wid].get('landuse') == 'winter_sports' and len(ids) > 3 and ids[0] == ids[-1]:
            domain.append([local(*nodes[n]) for n in ids[:-1]])

    # ---- Plazas: open skiable ground around lift stations. ----
    plazas = []
    for l in lifts:
        r = PLAZA_RADIUS.get(l['type'], 40)
        for end, p in (('bottom', l['points'][0]), ('top', l['points'][-1])):
            plazas.append({'lift': l['id'], 'end': end, 'x': p[0], 'y': p[1], 'r': r})

    # ---- Walkways: a lift whose top plaza touches no piste gets a connection to the nearest one,
    # so arriving at the top is never a dead end. ----
    for pl in [p for p in plazas if p['end'] == 'top']:
        best = None
        for t in trails:
            for a_, b_ in zip(t['points'], t['points'][1:]):
                dx, dy = b_[0] - a_[0], b_[1] - a_[1]; L2 = dx * dx + dy * dy or 1e-9
                u = max(0, min(1, ((pl['x'] - a_[0]) * dx + (pl['y'] - a_[1]) * dy) / L2))
                q = [a_[0] + u * dx, a_[1] + u * dy]
                gap = math.dist(q, (pl['x'], pl['y'])) - t['width'] / 2 - pl['r']
                if best is None or gap < best[0]: best = (gap, q, t)
        if best and best[0] > 0:
            q, t = best[1], best[2]
            n = max(2, int(math.dist(q, (pl['x'], pl['y'])) / 15))
            pts = [[round(pl['x'] + (q[0] - pl['x']) * k / n, 1), round(pl['y'] + (q[1] - pl['y']) * k / n, 1)] for k in range(n + 1)]
            pts = [[x, y, round(dem(*to_latlon(x, y)), 1)] for x, y in pts]
            if pts[0][2] < pts[-1][2]: pts.reverse()  # like every piste, stored downhill
            lift_name = next(l['name'] for l in lifts if l['id'] == pl['lift'])
            trails.append({'id': f"walk-{pl['lift']}", 'name': '', 'difficulty': 'connection', 'kind': 'connection',
                           'osmIds': [], 'nodeIds': [f"walk-{pl['lift']}-{i}" for i in range(len(pts))], 'points': pts,
                           'grooming': None, 'directionFlag': False, 'estimated': True, 'walkway': True,
                           'width': DEFAULT_WIDTH['connection'], 'widthSections': [],
                           'corrections': {'walkway': [f'{lift_name} top station touches no piste; connected to {t["name"] or "the nearest piste"} ({round(best[0])} m gap).']}})
            stats['walkways'] += 1

    # ---- Shape rule 2/3: aprons. Sharp bends and sharp forks get a round patch of piste so a
    # skier has room to turn instead of meeting a knife-edge corner. ----
    def width_at_index(t, i):
        cum = along(t['points']); f = cum[i] / (cum[-1] or 1)
        return next((w for f0, f1, w in reversed(t['widthSections']) if f0 <= f <= f1), t['width'])
    aprons = []
    for t in trails:
        p = t['points']
        for i in range(1, len(p) - 1):
            a = turn_deg(p[i - 1], p[i], p[i + 1])
            if a > CORNER_APRON_ANGLE:
                aprons.append({'x': p[i][0], 'y': p[i][1], 'r': round(width_at_index(t, i) * APRON_SCALE, 1), 'why': f"{t['name'] or t['difficulty']}: {round(a)}° bend"})
    node_at = collections.defaultdict(list)
    for t in trails:
        for i, n in enumerate(t['nodeIds']): node_at[n].append((t, i))
    for n, users in node_at.items():
        for b, j in users:
            if j != 0 or len(b['points']) < 2: continue  # b starts here: is it a sharp fork off a piste passing through?
            for a, i in users:
                if a is b or i == 0 or i == len(a['points']) - 1: continue
                arrive = math.atan2(a['points'][i][1] - a['points'][i - 1][1], a['points'][i][0] - a['points'][i - 1][0])
                leave = math.atan2(b['points'][1][1] - b['points'][0][1], b['points'][1][0] - b['points'][0][0])
                angle = abs(math.degrees(math.atan2(math.sin(leave - arrive), math.cos(leave - arrive))))
                if angle > JUNCTION_APRON_ANGLE:
                    r = max(width_at_index(a, i), b['width']) * APRON_SCALE
                    aprons.append({'x': a['points'][i][0], 'y': a['points'][i][1], 'r': round(r, 1), 'why': f"{b['name'] or b['difficulty']} leaves {a['name'] or a['difficulty']} at {round(angle)}°"})
    stats['aprons'] = len(aprons)

    # ---- Shape rule 4: loose ends. A piste start/end that lies on no other piste and no plaza gets a
    # connection: starts from a piste above, ends to a piste or plaza below (within LOOSE_END_RADIUS). ----
    loose_radius = fix.get('looseEndRadius', LOOSE_END_RADIUS)
    def covered(pt, me):
        if any(math.dist(pt[:2], (pl['x'], pl['y'])) < pl['r'] for pl in plazas): return True
        if any(math.dist(pt[:2], (ap['x'], ap['y'])) < ap['r'] for ap in aprons): return True
        for o in trails:
            if o is me: continue
            for a_, b_ in zip(o['points'], o['points'][1:]):
                dx, dy = b_[0] - a_[0], b_[1] - a_[1]; L2 = dx * dx + dy * dy or 1e-9
                u = max(0, min(1, ((pt[0] - a_[0]) * dx + (pt[1] - a_[1]) * dy) / L2))
                if math.dist((a_[0] + u * dx, a_[1] + u * dy), pt[:2]) < o['width'] / 2 + me['width'] / 2: return True
        return False
    def nearest_point(pt, me, above):
        best = None
        for o in trails:
            if o is me: continue
            for q in o['points']:
                if (above and q[2] < pt[2] - 5) or (not above and q[2] > pt[2] + 5): continue
                dd = math.dist(q[:2], pt[:2]) - o['width'] / 2
                if dd < loose_radius and (best is None or dd < best[0]): best = (dd, q, o)
        for pl in plazas:
            q = [pl['x'], pl['y'], dem(*to_latlon(pl['x'], pl['y']))]
            if (above and q[2] < pt[2] - 5) or (not above and q[2] > pt[2] + 5): continue
            dd = math.dist(q[:2], pt[:2]) - pl['r']
            if dd < loose_radius and (best is None or dd < best[0]): best = (dd, q, None)
        return best
    for t in list(trails):
        if t.get('walkway'): continue
        for end in ('start', 'end'):
            pt = t['points'][0] if end == 'start' else t['points'][-1]
            if covered(pt, t): continue
            hit = nearest_point(pt, t, above=end == 'start')
            if not hit:
                stats['looseEndsUnfixed'] += 1; print(f"loose {end} of {t['name'] or t['id']} has nothing within {loose_radius} m"); continue
            a_, b_ = (hit[1], pt) if end == 'start' else (pt, hit[1])
            n = max(2, int(math.dist(a_[:2], b_[:2]) / 15))
            pts = [[round(a_[0] + (b_[0] - a_[0]) * k / n, 1), round(a_[1] + (b_[1] - a_[1]) * k / n, 1)] for k in range(n + 1)]
            pts = [[x, y, round(dem(*to_latlon(x, y)), 1)] for x, y in pts]
            if pts[0][2] < pts[-1][2]: pts.reverse()
            target = hit[2]['name'] if hit[2] else 'a lift plaza'
            trails.append({'id': f"link-{t['id']}-{end}", 'name': '', 'difficulty': 'connection', 'kind': 'connection',
                           'osmIds': [], 'nodeIds': [f"link-{t['id']}-{end}-{i}" for i in range(len(pts))], 'points': pts,
                           'grooming': None, 'directionFlag': False, 'estimated': True, 'walkway': True,
                           'width': DEFAULT_WIDTH['connection'], 'widthSections': [],
                           'corrections': {'looseEnd': [f"{t['name'] or t['id']} {end} touched nothing; connected to {target or 'a piste'}"]}})
            stats['looseEndsConnected'] += 1

    # ---- Topology. Shared OSM nodes = real junctions; proximity links are marked approximate. ----
    cums = {t['id']: along(t['points']) for t in trails}
    node_pos = collections.defaultdict(list)  # nodeId -> [(trail, index)]
    for t in trails:
        for i, n in enumerate(t['nodeIds']): node_pos[n].append((t, i))
    for t in trails:
        links, seen = [], set()
        cum = cums[t['id']]
        for i, n in enumerate(t['nodeIds']):
            for o, j in node_pos[n]:
                if o is t or j == len(o['nodeIds']) - 1: continue  # can't continue onto the end of another piste
                k = (o['id'], round(cum[i] / 30))
                if k in seen: continue
                seen.add(k)
                links.append({'to': o['id'], 'at': round(cum[i], 1), 'toAt': round(cums[o['id']][j], 1), 'how': 'node'})
        # Endpoint with no shared-node continuation: nearest piste passing within 30 m.
        if not any(l['at'] >= cum[-1] - 1 for l in links):
            end = t['points'][-1]
            radius = DRAWN_LINK_RADIUS if t.get('estimated') else 30
            for o in trails:
                if o is t: continue
                d, a = project(end, o['points'], cums[o['id']])
                if d < radius and a < cums[o['id']][-1] - 20:
                    # 'gap' = OSM lines don't touch but the official map shows them connected.
                    how = 'estimated' if t.get('estimated') or o.get('estimated') else 'gap' if d <= fix['acceptNearGaps']['maxGap'] else 'near'
                    links.append({'to': o['id'], 'at': round(cum[-1], 1), 'toAt': round(a, 1), 'how': how, 'gap': round(d)})
        t['links'] = links
    # Entries into hand-drawn pistes: from any piste passing near their start.
    for e in [t for t in trails if t.get('estimated')]:
        for o in trails:
            if o is e: continue
            d, a = project(e['points'][0], o['points'], cums[o['id']])
            if d < DRAWN_LINK_RADIUS and a > 5:
                o['links'].append({'to': e['id'], 'at': round(a, 1), 'toAt': 0, 'how': 'estimated', 'gap': round(d)})
    for t in trails:
        t['links'].sort(key=lambda l: l['at'])
    for l in lifts:
        top, bottom = l['points'][-1], l['points'][0]
        l['exits'] = []
        for o in trails:
            d, a = project(top, o['points'], cums[o['id']])
            if d < LIFT_LINK_RADIUS and a < cums[o['id']][-1] - 20:
                l['exits'].append({'to': o['id'], 'toAt': round(a, 1), 'gap': round(d)})
        l['exits'].sort(key=lambda e: e['gap'])
        l['entries'] = []
        for o in trails:
            d, a = project(bottom, o['points'], cums[o['id']])
            if d < LIFT_LINK_RADIUS: l['entries'].append({'from': o['id'], 'at': round(a, 1), 'gap': round(d)})

    # ---- Terrain grid ----
    allpts = [p for t in trails + lifts for p in t['points']]
    x0, y0 = local(BBOX['s'], BBOX['w']); x1, y1 = local(BBOX['n'], BBOX['e'])
    minX, minY = math.ceil(x0 / GRID) * GRID, math.ceil(y0 / GRID) * GRID
    cols, rows = int((x1 - minX) // GRID) + 1, int((y1 - minY) // GRID) + 1
    heights = [round(dem(*to_latlon(minX + c * GRID, minY + r * GRID)), 1) for r in range(rows) for c in range(cols)]

    # ---- Scenery ----
    rel_rings = []
    for rel in xml.findall('relation'):
        t = tags_of(rel)
        if t.get('type') == 'multipolygon' and (t.get('landuse') == 'forest' or t.get('natural') == 'wood'):
            r = rings_from_relation(rel, way_nodes)
            rel_rings.append([[local(*nodes[n]) for n in ring[:-1]] for ring in r['outer'] + r['inner'] if len(ring) > 3])
    forests = [[[local(*nodes[n]) for n in ids[:-1]]] for wid, ids in way_nodes.items()
               if (way_tags[wid].get('landuse') == 'forest' or way_tags[wid].get('natural') == 'wood') and len(ids) > 3 and ids[0] == ids[-1]]
    forests += rel_rings
    buildings, restaurants = [], []
    for wid, ids in way_nodes.items():
        t = way_tags[wid]
        # Ruins and old fortifications are not huts; drawing them as chalets would mislead.
        if 'building' not in t or t['building'] in ('ruins', 'bunker') or len(ids) < 4: continue
        pts = [local(*nodes[n]) for n in ids[:-1]]
        a = abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))) / 2
        cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        buildings.append({'x': round(cx, 1), 'y': round(cy, 1), 'area': round(a)})
        if t.get('amenity') in ('restaurant', 'cafe', 'bar') and t.get('name'):
            restaurants.append({'name': t['name'], 'x': round(cx, 1), 'y': round(cy, 1), 'kind': t['amenity']})
    peaks = []
    for nid, t in node_tags.items():
        x, y = local(*nodes[nid])
        if t.get('amenity') in ('restaurant', 'cafe', 'bar') and t.get('name'):
            restaurants.append({'name': t['name'], 'x': x, 'y': y, 'kind': t['amenity']})
        if t.get('natural') == 'peak' and t.get('name'):
            peaks.append({'name': t['name'], 'x': x, 'y': y, 'ele': t.get('ele')})

    meta = {
        'name': RESORT['name'], 'scope': RESORT['scope'], 'homeLift': RESORT['homeLift'],
        'origin': ORIGIN, 'bbox': BBOX, 'osmSnapshotAt': osm_base, 'units': 'meters', 'coordinates': 'x east, y north, z DEM altitude',
        'sources': [
            {'name': '© OpenStreetMap contributors', 'license': 'ODbL 1.0', 'url': 'https://www.openstreetmap.org/copyright', 'via': OVERPASS},
            {'name': f'Mapzen Terrain Tiles / AWS, Terrarium zoom {ZOOM}', 'url': 'https://registry.opendata.aws/terrain-tiles/',
             'attribution': 'EU-DEM (Copernicus), SRTM/GMTED2010 (USGS)'}],
        'stats': {'runs': len(trails), 'lifts': len(lifts), 'pisteAreas': len(piste_areas), **stats,
                  'nodeLinks': sum(1 for t in trails for l in t['links'] if l['how'] == 'node'),
                  'gapLinks': sum(1 for t in trails for l in t['links'] if l['how'] == 'gap'),
                  'nearLinks': sum(1 for t in trails for l in t['links'] if l['how'] == 'near')},
        'corrections': f"{(out / 'corrections.json').relative_to(ROOT)} (official resort data overrides OSM)",
        'liftLinkRadius': LIFT_LINK_RADIUS, 'drawnLinkRadius': DRAWN_LINK_RADIUS, 'widths': str((out / 'piste-widths.csv').relative_to(ROOT)),
    }
    terrain = {'cols': cols, 'rows': rows, 'minX': minX, 'minY': minY, 'stepX': GRID, 'stepY': GRID, 'heights': heights,
               'source': meta['sources'][1]['name']}
    (out / 'resort.json').write_text(json.dumps({'meta': meta, 'trails': trails, 'lifts': lifts, 'plazas': plazas, 'aprons': aprons, 'domain': domain, 'pisteAreas': piste_areas, 'terrain': terrain}, ensure_ascii=False, separators=(',', ':')))
    (out / 'scenery.json').write_text(json.dumps({'forests': forests, 'buildings': buildings, 'restaurants': restaurants, 'peaks': peaks}, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps(meta['stats'], ensure_ascii=False), f'terrain {cols}x{rows}', f'forests {len(forests)} buildings {len(buildings)} restaurants {len(restaurants)}')


if __name__ == '__main__':
    main()
