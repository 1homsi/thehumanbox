# Cubeforge: what is missing or could be better

Written from The Human Box's point of view: the goal is for the whole world view
to run on cubeforge, and to prove the engine can carry a real game. Each item is
marked **Verified** (I read the code or measured it) or **To check** (a likely gap
I did not confirm). Repo: `/Users/mhomsi/dev/extra/1homsi/cubeforge/cubeforge`.

Baseline when this was written: `pnpm run typecheck` clean, `pnpm test` 114 files /
1997 tests passing. Three agents were started on performance, correctness and
packaging; check their PRs on `1homsi/cubeforge` before duplicating any of this.

## What Human Box needs from the engine

- A 600x300 tile world (180k tiles) that changes rarely; never one entity per tile.
- 3,000+ moving sprite entities (people, animals, buildings) created, updated and
  removed every frame from external simulation data. 60 fps.
- Camera pan/zoom/gestures, screen to world conversion, click/hover picking of entities.
- Text and emote overlays, effects, a day/night tint, weather overlays.
- Pixel-art crisp rendering at fractional zoom and any devicePixelRatio.
- Works when the tab is hidden, the window resizes, or the GL context is lost.

Today Human Box uses 11 symbols (`Game`, `World`, `Entity`, `Camera2D`, `Transform`,
`Sprite`, `useEntity`, `useGame`, `useDynamicCanvas`, `useCamera`, `useGestures`) and
draws everything else itself on a 2D canvas, then shows that one canvas as a sprite.

## 1. Bundle size and packaging (high priority)

- **Verified:** importing only those 11 symbols bundles to about 205 kB minified
  (56 kB gzip), all attributed to `cubeforge`. The published package is one
  pre-bundled file (`dist/index.js` 565 kB plus a 302 kB shared chunk) because
  `integrations/cubeforge/tsup.config.ts` sets `noExternal: [/^@cubeforge\//]`,
  inlining audio, physics (~23k lines), input, net, devtools, editor and gameplay.
- **Verified:** no `package.json` in the repo declares `"sideEffects"`, so bundlers
  must assume every module has side effects.
- Fix: remove real import-time side effects, add `sideEffects: false` (or a list),
  keep sub-packages external and published separately (or per-file ESM output), and
  add a focused entry (for example `cubeforge/render`) with only renderer, camera,
  sprite and the hooks. Add a CI check that a fixed list of imports stays under a byte
  budget and excludes physics/audio/net/editor.
- **Verified:** versions are inconsistent. The meta-package is `0.8.3` in the repo
  while Human Box installs `0.9.1`; workspace packages are mostly `0.0.1`. Decide on
  one release/versioning scheme and make `publish-packages.mjs` check it.

## 2. A large-grid tile layer (high priority)

- **Verified:** there is a `Tilemap` component
  (`integrations/cubeforge/src/components/Tilemap.tsx`, Tiled-oriented) and
  `packages/core/src/tilemapMerge.ts` (collider merging).
- **To check:** how `Tilemap` renders. If it creates an entity or a draw per tile it
  cannot carry 180k tiles. The engine needs a layer type that owns a typed array of
  tile ids, renders it as chunked textures or an instanced chunk grid, culls to the
  camera, and supports cheap partial updates (change a handful of tiles per frame,
  replace the whole array on a season change). Tile animation (water shimmer) should be
  a shader/uniform concern, not per-tile JS.

## 3. Entity throughput through the React layer (high priority)

- **To check:** creating, updating and removing thousands of `<Entity>` / `<Sprite>`
  per frame from external data. React reconciliation per entity is likely the first
  wall after the renderer. The renderer itself is fine for crowds (below).
- Likely fix: an imperative or data-driven sprite layer (a `<SpriteLayer>` that takes an
  array/struct-of-arrays of positions, frames, tints and ids and writes instance data
  directly), plus entity pooling. Keep the React-first API; add the fast path beside it.

## 4. Renderer: what is good and what to improve

- **Verified (good):** `packages/renderer/src/webglRenderSystem.ts` is a WebGL2
  instanced renderer: 19 floats per sprite, up to 16,384 sprites per
  `drawArraysInstanced`, batching by texture, a 1,024-texture LRU, text texture cache
  (200 entries), particles, post-processing, idle-frame skipping, a canvas2d fallback.
- **Verified:** `registerDynamicCanvas` uploads the whole canvas with `texImage2D` and
  re-uploads all of it when marked dirty. Fine for one map canvas, wasteful for large
  canvases with small changes. Add dirty-rect updates (`texSubImage2D`) and an
  `ImageBitmap`/`OffscreenCanvas` path.
- **To check:** per-frame allocations in the render loop (sort keys as strings,
  closures, temporary arrays), sort cost with 10k+ sprites, LRU eviction of a texture
  still referenced this frame, text cache limit of 200 for unique strings, and canvas2d
  versus WebGL visual parity.
- Frustum culling of sprites outside the camera, and a sprite atlas / texture-array path
  so thousands of different frames do not split batches.
- Pixel-art mode: nearest sampling, snap-to-pixel at fractional zoom and arbitrary
  devicePixelRatio, no seams between tiles.

## 4b. Picking and interaction

- **To check:** a fast way to answer "what entity is under the cursor?" for thousands
  of sprites (spatial hash or GPU id pass) and screen/world conversions at any zoom and
  DPR. Human Box needs click-to-select a person and hover tooltips.

## 5. Camera and gestures

- **To check:** `useCamera` / `useGestures` behaviour: wheel and pinch zoom around the
  cursor, inertia, bounds clamping, follow target with smoothing, pointer capture,
  touch plus mouse together, correct coordinates after a resize or DPR change.

## 6. Lifecycle and robustness

- **Verified (recently fixed upstream):** resize preserving dynamic canvases, early ECS
  queries, GL context loss suspend/restore. Keep a regression test for each.
- **To check:** React StrictMode double mount, HMR, unmount cleanup (GL textures,
  listeners, rAF), `document.hidden` pause/resume, fixed versus variable timestep, a
  frame budget guard so a slow frame does not spiral.

## 7. ECS correctness at scale

- **To check:** stale entity ids after reuse, queries invalidated by add/remove during
  iteration, destroy during a system, hierarchy updates for many children, event/script
  ordering. Property or fuzz tests that run thousands of random create/destroy/query
  operations would catch most of this.

## 8. Input and audio

- **To check:** listener cleanup on unmount, stuck keys on blur/focus loss, pointer
  events versus touch, and audio context unlock under autoplay policies, disposal, and
  many simultaneous sounds (Human Box has ambient and event audio).

## 9. Observability and tooling

- A built-in stats API: frame time split (ECS, React, render), draw calls, instance
  count, texture memory, entity count, cache hit rates; an overlay in devtools. Without
  it, performance work is guesswork.
- A reproducible benchmark in the repo (`benchmarks/`) with N sprites, entity churn, a
  big tile layer and a big dynamic canvas, runnable in CI against a budget.
- A headless or test renderer so games can unit-test render output (draw calls,
  instance data) without a GPU.

## 10. Docs and API shape

- A guide for "data-driven games" (simulation outside React feeding the engine), since
  that is the Human Box shape and probably many others.
- A migration guide for moving a hand-written canvas renderer onto entities.
- Keep API changes additive; document performance characteristics (what is cheap, what
  is O(n) per frame).

## Suggested order

1. Packaging and `sideEffects` (quick, immediately useful, easy to measure).
2. Stress benchmark and stats API (so everything after is measured).
3. Large-grid tile layer.
4. Imperative/data-driven sprite layer and entity pooling.
5. Picking and camera/gesture correctness.
6. Dirty-rect texture updates, culling, atlas path.
7. ECS/lifecycle fuzz tests.
8. Docs.
