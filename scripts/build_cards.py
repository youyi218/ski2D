#!/usr/bin/env python3
"""Small per-resort summaries for the landing page, so it can show every resort without loading their full data.

  python3 scripts/build_cards.py   # reads each resort.json, writes card.json next to it

A card holds a few stats, a coarse hillshade (one digit 0–4 per cell, 0 = lit) and the pistes and lifts
simplified to that grid (128 × 96), cropped to the skiable area at a fixed 4:3 aspect.
"""
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIRS = {'saint-lary': ROOT / 'data', 'isola': ROOT / 'data/isola', 'serre-chevalier': ROOT / 'data/serre-chevalier'}
W, H_ = 128, 96   # thumbnail pixels (4:3); metres per pixel varies by resort
MARGIN = 400     # metres kept around pistes and lifts
ASPECT = W / H_
LIGHT = (-.55, .55, .63)  # same light as makeShade in src/world.js


def simplify(pts, tol):
    """Douglas–Peucker on 2D points."""
    if len(pts) < 3: return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    L = math.hypot(bx - ax, by - ay) or 1e-9
    i, d = max(((k, abs((bx - ax) * (ay - p[1]) - (ax - p[0]) * (by - ay)) / L) for k, p in enumerate(pts[1:-1], 1)), key=lambda t: t[1])
    if d <= tol: return [pts[0], pts[-1]]
    return simplify(pts[:i + 1], tol)[:-1] + simplify(pts[i:], tol)


def card(d):
    t = d['terrain']
    H = lambda x, y: t['heights'][min(t['rows'] - 1, max(0, round((y - t['minY']) / t['stepY']))) * t['cols'] + min(t['cols'] - 1, max(0, round((x - t['minX']) / t['stepX'])))]
    lines = d['trails'] + d['lifts']
    xs = [p[0] for r in lines for p in r['points']]; ys = [p[1] for r in lines for p in r['points']]
    x0, x1, y0, y1 = min(xs) - MARGIN, max(xs) + MARGIN, min(ys) - MARGIN, max(ys) + MARGIN
    if (x1 - x0) / (y1 - y0) < ASPECT: pad = ((y1 - y0) * ASPECT - (x1 - x0)) / 2; x0, x1 = x0 - pad, x1 + pad
    else: pad = ((x1 - x0) / ASPECT - (y1 - y0)) / 2; y0, y1 = y0 - pad, y1 + pad
    # Keep the crop on the terrain grid (no smeared edges): shrink it to fit, keeping the aspect, then slide it inside.
    tx0, ty0 = t['minX'], t['minY']; tx1, ty1 = tx0 + (t['cols'] - 1) * t['stepX'], ty0 + (t['rows'] - 1) * t['stepY']
    k = min(1, (tx1 - tx0) / (x1 - x0), (ty1 - ty0) / (y1 - y0))
    cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * k / 2, (y1 - y0) * k / 2
    cx, cy = min(max(cx, tx0 + hw), tx1 - hw), min(max(cy, ty0 + hh), ty1 - hh)
    x0, x1, y0, y1 = cx - hw, cx + hw, cy - hh, cy + hh
    w, h, CELL = W, H_, (x1 - x0) / W

    # Hillshade at the cell centres, posterised into 5 bands between the 3rd and 97th percentile.
    ll = math.hypot(*LIGHT); shade = []
    for j in range(h):
        y = y1 - (j + .5) * CELL
        for i in range(w):
            x = x0 + (i + .5) * CELL
            dx, dy = (H(x + CELL, y) - H(x - CELL, y)) / (2 * CELL), (H(x, y + CELL) - H(x, y - CELL)) / (2 * CELL)
            n = (-dx * 1.6, -dy * 1.6, 1)
            shade.append(sum(a * b for a, b in zip(n, LIGHT)) / math.hypot(*n) / ll)
    s = sorted(shade); lo, hi = s[int(len(s) * .03)], s[int(len(s) * .97)]
    bands = [str(max(0, min(4, int((1 - (v - lo) / (hi - lo)) * 5)))) for v in shade]

    px = lambda p: [round((p[0] - x0) / CELL, 1), round((y1 - p[1]) / CELL, 1)]
    def path(r): return [c for p in simplify([px(p) for p in r['points']], .35) for c in p]
    runs = [r for r in d['trails'] if r['kind'] == 'run']
    km = {k: round(sum(math.dist(a[:2], b[:2]) for r in runs if r['difficulty'] == k for a, b in zip(r['points'], r['points'][1:])) / 1000, 1)
          for k in ('green', 'blue', 'red', 'black')}
    zs = [p[2] for r in lines for p in r['points']]
    return {
        'name': d['meta']['name'], 'osmSnapshotAt': d['meta']['osmSnapshotAt'],
        'stats': {'pistes': len({r['name'] for r in runs if r['name']}),
                  'lifts': sum(1 for l in d['lifts'] if l.get('type') != 'magic_carpet'),
                  'km': km, 'low': round(min(zs)), 'high': round(max(zs))},
        'map': {'w': w, 'h': h, 'cell': round(CELL, 1), 'shade': ''.join(bands),
                'trails': [[r['difficulty'], path(r)] for r in sorted(d['trails'], key=lambda r: r['kind'] == 'run')],
                'lifts': [px(l['points'][0]) + px(l['points'][-1]) for l in d['lifts']]},
    }


def main():
    for slug, folder in DIRS.items():
        c = card(json.loads((folder / 'resort.json').read_text()))
        (folder / 'card.json').write_text(json.dumps(c, ensure_ascii=False, separators=(',', ':')))
        print(slug, c['stats'], f"{c['map']['w']}x{c['map']['h']}", f"{(folder / 'card.json').stat().st_size // 1024} KB")


if __name__ == '__main__':
    main()
