# Saint-Lary Implementation Plan

> Execute inline using executing-plans, with independent data acquisition delegated. No Git repository exists; no Git operations or worktree are required.

**Goal:** A playable, local, pixel-styled Saint-Lary route-learning game.
**Architecture:** Source-traceable cached resort data, pure route simulation, Three.js orthographic renderer, responsive DOM interface.
**Tech Stack:** JavaScript ES modules, Three.js, Vite, Node test runner.
**Spec:** `docs/design.md`.

## Global constraints

- Preserve French trail names and source provenance.
- Clearly distinguish real geometry/elevation from illustrative scenery and assisted gameplay.
- No publishing, commits or external writes.

## Review focus

- Pausing, dialog opening, tab switching and rotation must not leave motion or held inputs stuck.
- Route endpoints and zero-length segments must not create NaN or send players beyond the route.
- Connected-route choices must respect elevation and distance, not only map-line crossings.
- Failed loading/WebGL availability must produce a useful screen instead of a blank canvas.
- Narrow screens must retain access to route selection and all controls.

## Tasks

- [ ] 1. Acquire offline data. Agent owns `data/`, `scripts/`, `docs/data-sources.md`; verify bounds, IDs and sources locally.
- [ ] 2. Core simulation. Write failing tests in `tests/core.test.js`, implement `src/core.js`: prepareRoute, sampleRoute, heightAt, createRun, advanceRun, connectedRoutes. Run `npm test`.
- [ ] 3. Presentation. Create `src/scene.js`, `src/art.js`, `src/main.js`, `src/style.css`, `index.html`, package configuration. Match data schema; implement loading/error, selection, keyboard/touch, pause/dialog, restart, lift and end-of-run flows.
- [ ] 4. Integrate. Validate actual resort data with Node tests, run `npm run build`, start local Vite. Test rendered app in browser, take screenshot, check console, exercise skiing/brake/rotate/pause/restart/route/lift and narrow layout.
- [ ] 5. Independent review, fix significant findings, verify appropriate checks, document limitations/run instructions, open playable app.

## Progress

Data contract agreed: x=east meters, y=north meters, z=altitude. Terrain grid row-major, rows increase north. Trails use green/blue/red/black; unsupported source tags retained as uncertainty rather than fabricated.
