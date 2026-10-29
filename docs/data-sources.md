# Saint-Lary data sources

All geography comes from two public sources. Everything else (tree placement, sprite art, piste width where OSM has no area, gameplay speed) is artistic and not data.

## 1. OpenStreetMap

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). `data/resort.json` and `data/scenery.json` are derivative databases under the same licence.

- Downloaded through the [Overpass API](https://overpass-api.de/) on 2026-10-22; OSM database state `osm_base = 2026-10-21T23:12:25Z` (recorded in `meta.osmSnapshotAt`).
- Area: bbox S 42.805, W 0.200, N 42.855, E 0.325 — the extent of the OSM ski-area outline *Domaine de Saint-Lary* (`landuse=winter_sports`, way 962494483), padded. This covers Pla d'Adet (1700), Espiaube and the Vallon du Portet side.
- Raw XML retained at `data/raw/v2/saint-lary.osm`; the query is in `scripts/build_resort.py` (`QUERY`).
- The earlier codex snapshot (smaller bbox 0.25–0.31 / 42.80–42.84, zoom-12 DEM) is kept in `data/raw/v1/` for reference only.

What is read and how:

| OSM feature | Used as |
|---|---|
| `piste:type=downhill` ways | runs. `piste:difficulty` novice/easy/intermediate/advanced(+expert, freeride) → green/blue/red/black; missing → `unknown` |
| `piste:type=connection` ways | connections (thin, no poles/signs) |
| closed `piste:type=downhill` / `area=yes` | piste areas, drawn at their mapped width |
| `route=piste` relations | name/difficulty inherited by member ways lacking them (none exist in this snapshot) |
| `aerialway=*` ways | lifts; oriented bottom → top by DEM |
| `landuse=forest` / `natural=wood`, ways **and multipolygon relations** | forest outlines (inner rings cut out) |
| `building` | building position + footprint area |
| `amenity=restaurant/cafe/bar` with `name` | labelled huts |
| `natural=peak` with `name` | labels |

Processing rules:

- **Direction**: the OSM drawing direction is kept (OSM convention: pistes are drawn in the direction of travel). The DEM is only used to flag ways that climb more than 25 m; in this snapshot none do.
- **Merging**: consecutive ways are joined only when one ends exactly at the next one's start node, name + difficulty match exactly (case-sensitive), and the continuation is unambiguous. So differently spelled names stay separate (e.g. `Bouleaux` vs `bouleaux`).
- **Names**: `piste:name`, then `name`; otherwise `Sans nom` (runs) or `Liaison` (connections). Spellings are kept as mapped.
- **Junctions** (`links`): `node` = the two pistes share an OSM node (a real mapped junction). `near` = a piste end has no shared node, so the nearest piste within 30 m is offered and shown in-game as "数据未直接相连".
- **Lifts**: exits = pistes passing within 80 m of the top station; entries = pistes passing within 80 m of the bottom. These are proximity guesses; OSM does not link lifts to pistes.

## Corrections from official resort data

Where OSM disagrees with the resort's official piste list or panorama map, the official data wins. The overrides (names, colours, dropped duplicate ways and lifts, accepted ≤30 m gaps) are in `data/corrections.json` and applied at build time. Each run records its changes in `corrections`. Five pistes that are on the official panorama but missing from OSM (Lupins, Ludette, Source, Stade, Stade slalom) are hand-drawn from nearby OSM features; they are marked `estimated: true`, have no OSM IDs, and their positions are approximate. Lift ↔ piste links use `LIFT_LINK_RADIUS` (80 m) in `scripts/build_resort.py`. Evidence and open questions are in [official-comparison.md](official-comparison.md).

## Piste widths and station plazas

Widths are not in the data sources; they are set by hand in [`data/piste-widths.csv`](../data/piste-widths.csv) (one row per piste, prefilled with every official name). `width` is `窄 / 普通 / 宽 / 很宽` (25 / 45 / 70 / 100 m) or a number in metres. Optional `from` / `to` limit a row to part of the piste: 0 = top, 1 = bottom, `30%` also works. Later rows override earlier ones. Blank = default (45 m for pistes, 18 m for connections). A piste split into several OSM pieces measures `from` / `to` by altitude instead of distance. Rebuild with `.venv/bin/python scripts/build_resort.py`; unknown names are reported.

Each lift station gets a round, flat skiable plaza (radius by lift type, `PLAZA_RADIUS` in `scripts/build_resort.py`), so the pistes leaving a station start from one open area.

## No dead ends

- **Ski-domain wall.** The OSM ski-area outline (*Domaine de Saint-Lary*, `landuse=winter_sports` way 962494483) is exported as `domain`. The game unions it with a 30 m margin around every piste and plaza (`DOMAIN_MARGIN` in `src/world.js`) and treats everything outside as a wall, like the "limite du domaine skiable" on the official map. Nobody can ski off into the valley.
- **Walkways.** A lift whose top plaza touches no piste gets an unnamed connection to the nearest one (`walkway: true`, `estimated: true`). Currently only the Téléphérique Pic Lumière top (130 m to École).
- **Gameplay helpers** (`SKI` in `src/core.js`): pistes that descend overall never feel flatter than 8 % along their direction (`minGrade`, just above the 5 % that snow friction cancels); groomed pistes keep only 25 % of the terrain's cross-slope (`crossSlope`); hands-off, the skier follows the piste ahead, slows for tight bends and skates back if it drifts off.
- **Check**: hands-off from every piste start, 142 of 153 runs end up boarding a lift and 6 stop on the flat within 150 m of one. The other 5 start inside a lift-top plaza, where the player chooses a direction. Speeds use real physics (see `SKI` in `src/core.js`): straight down a 20 % blue run settles around 70 km/h.

## Shape rules

Applied by `scripts/build_resort.py` (thresholds are constants at the top of that file) and recorded per run in `corrections`, or in `aprons`:

1. **Spikes** — a vertex turning more than `SPIKE_ANGLE` (120°) next to a segment shorter than `SPIKE_SEGMENT` (20 m) is a mapping slip and is removed (6 in this snapshot).
2. **Bend aprons** — where a piste bends more than `CORNER_APRON_ANGLE` (70°), a round patch of piste (radius `APRON_SCALE` × width) fills the inside of the corner.
3. **Fork aprons** — where a branch leaves a piste more sharply than `JUNCTION_APRON_ANGLE` (100°), the fork gets the same patch, so the branch can be entered without a standing turn. 34 aprons in total.
4. **Loose ends** — a piste start (or end) that lies on no other piste, plaza or apron is connected to the nearest piste or plaza above (or below) within `LOOSE_END_RADIUS` (200 m): an unnamed, estimated connection. Currently the starts of the hand-drawn Stade (→ Ours) and Stade slalom (→ Col).

In the game, piste centrelines are also rounded at bends over ~20° (`roundCorners` in `src/core.js`, cut at most 0.6 × width), which affects drawing and the hands-off line but not the stored data. With all of this, 145 of 155 hands-off runs reach a lift.

## 2. Elevation

[Mapzen Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/), Terrarium encoding, zoom 13 (x 4100–4103, y 3014–3016, ~14 m pixels at this latitude), retained in `data/raw/v2/`. Resampled bilinearly to a 40 m grid for hillshade/contours, and sampled at every OSM node for altitude. Attribution per the [provider document](https://github.com/tilezen/joerd/blob/master/docs/attribution.md): EU-DEM (Copernicus, funded by the European Union); SRTM and GMTED2010 (USGS). It is ground elevation, not snow surface.

## Rebuild

```sh
python3 -m venv .venv && .venv/bin/pip install pillow
.venv/bin/python scripts/build_resort.py           # from retained snapshot
.venv/bin/python scripts/build_resort.py --fetch   # re-download OSM + tiles
.venv/bin/python scripts/build_cards.py            # landing-page cards (card.json) for every resort
.venv/bin/python scripts/test_data.py
```

## Not claimed

Not an official piste map, not operational status, not verified against the resort's map. Community data can be incomplete or outdated; where it looks wrong, the fix belongs in OpenStreetMap itself.

---

# Isola 2000

Built by the same script: `.venv/bin/python scripts/build_resort.py --resort isola` (add `--fetch` to re-download). Everything lives in `data/isola/`: `raw/` (OSM XML + DEM tiles), `corrections.json`, `piste-widths.csv`, and the generated `resort.json` / `scenery.json`. The game loads it at `?resort=isola`.

- **OSM**: downloaded 2026-10-28 (`meta.osmSnapshotAt`). Area: bbox S 44.165, W 7.110, N 44.210, E 7.185 — the OSM ski-area outline *Isola 2000* (`landuse=winter_sports`, way 23079840), padded. Every piste and lift in the wider valley falls inside it.
- **Elevation**: same Mapzen Terrarium source, zoom 13, x 4257–4259, y 2972–2973.
- **Checked against the official map and OpenSkiMap** on 2026-10-29: names and colours follow the official 2025/26 piste map (official data wins). Details and open questions in [official-comparison.md](official-comparison.md#isola-2000--osm-vs-official-map-vs-openskimap). Official counts: 45 pistes, 20 lifts; this build has 19 lifts (the funicular is not read) and 43 named pistes.
- **Chevrette** stops mid-slope in OSM (2095 m). `looseEndRadius: 500` in `corrections.json` lets the loose-end rule join it to Sierra at the same altitude; that link is estimated.
- **Check**: hands-off from every piste start, 57 of 58 runs board a lift; Chastillon stops on the flat about 95 m from the Parcs drag lift.

Applies to all resorts: `building=ruins` / `bunker` are not drawn (the old border fortifications above Isola were showing up as chalets; this removed 2 ruins at Saint-Lary too).

---

# Serre Chevalier

Built by the same script: `.venv/bin/python scripts/build_resort.py --resort serre-chevalier` (add `--fetch` to re-download). Everything lives in `data/serre-chevalier/`, laid out like `data/isola/`. The game loads it at `?resort=serre-chevalier`.

- **OSM**: downloaded 2026-10-29 (`meta.osmSnapshotAt`). Area: bbox S 44.880, W 6.475, N 44.985, E 6.640 — the OSM ski-area outline *Serre Chevalier* (`landuse=winter_sports`, way 599436073), padded. It covers Briançon, Chantemerle, Villeneuve and Le Monêtier; the separate Pelvoux-Vallouise outline to the south is left out.
- **Elevation**: same Mapzen Terrarium source, zoom 13, x 4243–4247, y 2947–2950.
- **Checked against the official panorama and OpenSkiMap** on 2026-10-29: names and colours follow the official panorama (official data wins), lift names drop OSM's type codes. Details and open questions in [official-comparison.md](official-comparison.md#serre-chevalier--osm-vs-official-panorama-vs-openskimap). This snapshot has 70 lifts (official list: 50; the rest are village beginner lifts) and 107 piste names.
- **Size**: much larger than the other two (terrain 325 × 293 cells, ~11 800 buildings including Briançon); about 2 MB of JSON, loaded only when chosen. Still runs at full frame rate.
- **Check**: hands-off from every piste start (starting past any station plaza), 217 of 246 board a lift. Nearly all the others are unnamed stubs under 130 m that cross the slope and are never offered as a start; of named runs, Eychauda stalls on its ~3 % ridge section below Cucumelle, and a few end on the flat 40–80 m from a lift.
