# What The Human Box needs from cubeforge

Ranked by what they would win on the map, from profiles of the real app (`apps/web/bench`: a production
build in headless Chrome with the GPU, 1280x800, a saved world of seed 42 at tick 9000 with 172 people
and the same world with 3,000 more). Every item says where in the engine, what it costs today, what to
do, and how to see it. Numbers are from cubeforge 0.11.0 and 0.12.0 (the same code paths); "main thread"
is the share of one second the page's main thread is busy.

Reproduce a profile:

```sh
cd apps/web && pnpm exec vite build --sourcemap --outDir dist-prof
node bench/run.mjs --builds prof=dist-prof --profile --alloc-profile --gl-log \
  --fixtures standard --zooms mid --modes playing --passes metrics --runs 1 --window 10000
node bench/profile-summary.mjs bench/results/prof/standard-mid-playing-run1.cpuprofile --dist dist-prof
```

## 1. `SpriteLayer` draws from a retained buffer (about 4 % of the main thread, 9 % zoomed out)

`packages/renderer/src/spriteLayerGL.ts`, `SpriteLayerRenderer.draw` and `flush`.

Every frame, for every layer, `draw` walks all sprites in JS, culls them, packs 20 floats per visible sprite
into a `Float32Array` and uploads it with `bufferSubData`. The map's static layers (ground decor, mountains,
trees, shore, buildings, props: about 25,000 sprites that change only when the terrain does) are packed again
on every frame the engine renders, which is 60 a second while anything moves.

Measured, standard world, mid zoom: `draw` self time 3.2 % of the main thread plus `bufferSubData` 0.4 %,
17,000 instances per frame; zoomed out (whole world) 52,000 instances per frame; crowd at close zoom 4.2 %.
It scales with visible instances, not with what changed.

Do: keep, per layer, the packed instance buffer and its GL buffer, keyed by `layer.version` (and the order
version for `sortByKey` layers). Re-pack only when the version moved, and ideally only the touched range
(`layer.touchRange(i0, i1)`; `touch()` stays "everything"). Draw the retained buffer for the visible range
(a layer-level `static` hint, or sorted chunks by y, lets the draw skip culling in JS and let the GPU clip).
Layers that change every frame (people, animals) keep today's path.

Expected: about -3 to -4 points at mid zoom, about -9 zoomed out, -5 in a crowd. See it: profile above,
`draw (spriteLayerGL.js)` in "Self time by function".

## 2. Do not poll the gamepad every frame (about 1 % of the main thread)

`packages/input/src/gamepad.ts`, `flush` (called by `InputManager.flush` from the game loop's `fixedDt`).

`navigator.getGamepads()` runs on every engine frame; it is 0.9 % of the main thread on a map with no
gamepad. Do: poll only after a `gamepadconnected` event and stop after the last `gamepaddisconnected`.

Expected: -0.9 points while moving, 0 for a still map. See it: `getGamepads` / `flush (gamepad.js)` in the
profile, caller `flush (inputManager.js) < fixedDt (Game.js) < frame (gameLoop.js)`.

## 3. Vertex-shader wind (about 1 % of the main thread, 1 MB/s of garbage)

`packages/renderer/src/spriteLayerGL.ts` (vertex shader and the instance layout), `spriteLayerFlags.ts`.

The app rewrites a second sprite layer of canopy-only sprites about 12 times a second so trees sway by whole
pixels (`cf/vegetation/trees-driver.ts`, `TreesDriver.update`): 1.1 % of the main thread at 30 Hz before it
was throttled, and it reallocates. Do: a per-sprite flag `SPRITE_SWAY` plus a per-layer `u_time`, `u_amp`,
`u_lean` uniform and a per-sprite phase (the existing `rotation` slot can carry it), displacing the top part of
the sprite by `round(sin(t/620 + phase) * amp + lean)` pixels in the vertex shader. The app then draws trees
once from the retained buffer (item 1) and the sway layer disappears.

## 4. Atlas frames that are not a uniform grid (about 10 MB, and the start-up bakes)

`packages/renderer/src/spriteLayer.ts` (`LayerAtlas`), `spriteLayerGL.ts` (`uw`, `vh`, `cols`).

A layer atlas is a uniform grid of `frameWidth x frameHeight`, so the app keeps one page per cell size and
leaves a 1 px gutter around every cell. With the map's sprites that is: decor 7,744 cells of 14x14 on two
1024x1024 pages, mountains 9,770 cells of 10x12 on two, buildings 192 cells of 34x48 and 3 of 50x72 (pages
of 1024x1024 until the app made them grow on demand). Do: let a layer carry a `frames` table (Float32Array of
`u0, v0, u1, v1` per frame, or per-sprite UV written into the instance), so the app can shelf-pack mixed sizes
into one texture with no wasted cells. The app then drops the per-size pages and the gutter logic.

Expected: texture memory of the map's atlases down by about a third more than growing pages alone
(buildings and props share a page), and fewer pages per layer (the limit is 8).

## 5. Text on the map: use TextLayer, and let a run carry two styles (adopt after 0.12)

`packages/renderer/src/textLayer.ts`, `glyphAtlas.ts`.

The app draws names and thoughts with its own glyph atlas (`cf/overlays/glyph-atlas.ts`, `recorder.ts`):
every character is two sprites (a black outline glyph, then a white fill glyph) and the text is re-laid
out every time. On the crowd at close zoom that is `fillText` 1.1 % + `strokeText` 1.0 % + glyph lookups
0.3 % of the main thread. `TextLayer` bakes the outline into the glyph (`outlineColor`, `outlineWidth`), so
a label is one run of one-sprite glyphs, laid out once. Missing for a drop-in: per-run outline width and
colour without a new style per combination (names: 3 px black, thoughts: 2.5 px black), and `anchorY: 1` with
`baseline: 'bottom'` text placement matching `ctx.textBaseline = 'bottom'`. Both are small.

## 6. Stats and timing the benchmark cannot see

`packages/renderer/src/webglRenderSystem.ts` (`stats`, `_statTex`), `packages/core` `EngineStats`.

- `textureBytes` and the upload counters ignore `TileLayer` textures and tint uploads, and
  `tileLayerStats` is not in `EngineStats`. The map's terrain tileset and tint grid are missing from the
  number the app reports as engine texture memory.
- `_statTex` counts a dynamic canvas's size when it is registered and never again, so after
  `ManagedDynamicCanvas.resize()` (the app's atlas pages grow by rows) `stats.textureBytes` is an
  undercount: 13.6 MB reported against 24 MB of live textures counted by wrapping `texImage2D` /
  `deleteTexture` (`bench/run.mjs --gl-log`). Do: update the stat in `uploadDynamicCanvas` where the size
  change is detected (`texW`/`texH` already change there).
- There is no GPU time. Do: an optional `EXT_disjoint_timer_query_webgl2` query around the frame
  (`stats.gpuMs`, off by default), and a per-layer breakdown (`stats.layers: { name, instances, drawMs }[]`).
  Today the benchmark can only report the GPU process's main-thread busy time from a Chrome trace.
- `engine.stats` is typed optional; make it always present.

## 7. Dynamic canvases hold the pixels twice

`packages/renderer/src/dynamicCanvas.ts`, `webglRenderSystem.ts` `registerDynamicCanvas` / `uploadDynamicCanvas`.

A dynamic canvas is a 2D canvas (its own backing store: `canvas` in Chrome's memory dump, 43 MB for the
map's 67 MB of atlas textures) and a WebGL texture. For atlases painted once and then only sampled, the 2D
canvas is dead weight after the upload. Do: a `createDynamicTexture({ width, height })` whose pixels live as
an `ImageData`/`Uint8Array` the app writes with `putImageData`-style rects, or an option that frees the 2D
canvas after `markDirty` uploads (`retain: false`), keeping only the GPU texture. Also `resize` copies through
a temporary canvas on every call; growing by rows (what the app does) could use a doubled capacity so most
growth needs no copy.

## 8. Smaller things seen along the way

- `SpriteLayer.drawOrder()` insertion-sorts every frame a `sortByKey` layer is drawn, even when no key
  changed: a `touchKeys()` flag (keys unchanged unless the app says so) saves 0.3 % with 3,000 people.
- `registerDynamicCanvas` uploads the whole canvas with `texImage2D` at registration, so a 1024x1024 page that
  nothing has painted yet still costs 4 MB of texture and an upload; lazily creating canvases (0.12) removed
  that for the app, but registering with `width`/`height` only (no initial upload until the first `markDirty`)
  would remove it for everyone.
- Picking: `pickNearest(x, y, radius)` and a per-sprite hit rect (the app keeps a hidden layer of footprint
  rectangles just so `pick` hits a building's footprint rather than its padded cell).

## What The Human Box takes from 0.12.0 now

| 0.12 feature | Adopted | Why |
|---|---|---|
| Imperative dynamic canvases (`createDynamicCanvas`, `resize`, `dispose`) | yes (#288) | atlas pages are created when a cell size claims them and grow by rows: 109 textures / 71 MB of live WebGL textures became 44 / 24 MB, GPU process memory 220 -> 165 MB |
| TextLayer | after the engine items in 5 | outline per run is needed first |
| `TileLayer` `minFilter: 'mipmap'` | not yet | the app's flat far-zoom tileset already hides the shimmer; swapping it changes the picture and needs a screenshot review |
| `useCameraPanZoom` `onChange` | not needed | the camera controller already writes the camera inside the engine frame script that runs only when the loop is awake; the render loops are woken from the same place |
| Camera follow on a sprite | not yet | the people are `SpriteLayer` sprites, not entities; follow needs `CameraFollowSprite` with a layer + index, which could replace the app's per-frame follow target |
| Tile layers in the shared z-order | not yet | the heat map is one nearest-sampled sprite (720 KB); a real tile layer would save little |
