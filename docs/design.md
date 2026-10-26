# Saint-Lary — first playable

Build a local browser game that lets a skier explore real Saint-Lary-Soulan pistes before a trip. The user selected the resort after discussing a pixel-art 2.5D game with quarter-turn camera rotation. Execute locally without further approval gates, commits, publishing, or deployment, following the supplied AGENTS instructions.

## Scope

- Actual OSM piste/lift geometries and terrain elevations with explicit provenance; cache data locally, never depend on live services while playing.
- Orthographic Three.js terrain, original programmatic pixel-art trees, skier and mountain huts. Decorative vegetation/buildings are illustrative.
- Route selection, assisted downhill skiing with lateral steering, braking, pause/restart, endpoint choices, lift transport, and 90-degree camera rotation. Assistance follows the selected real centerline; this is a route-learning prototype, not a ski physics simulator.
- Chinese interface with original French piste names. A quiet editorial alpine visual style, cream UI, pine-green accents and icy snow. Clear control hints, north-up minimap, progress and run summary.
- Real route connections are candidate connections based on geographic proximity, explicitly not field-verified. Do not claim current opening status, precise piste widths or obstacle positions.

## Architecture

`data/resort.json` is a source-traceable offline snapshot. `src/core.js` implements sampling and gameplay without DOM/renderer dependencies. `src/scene.js` owns rendering and camera. `src/main.js` binds UI/input/state. `src/style.css` handles responsive layout. Node's test runner validates route progression, braking, rotation independence, endpoints and data integrity; Vite builds the static bundle. Browser checks validate actual rendering and controls.

## Initial acceptance

The user can open the local app, select a real named route, start a run, steer and brake, rotate without changing world progress, finish a run and choose another route. Terrain and routes load offline from the installed project. Sources and approximation boundaries are discoverable in the app. Keyboard and touch-button control paths are available.
