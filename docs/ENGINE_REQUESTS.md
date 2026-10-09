# What The Human Box needs from xipjs

> The engine was called cubeforge up to 0.14.0 and is published as `xipjs` from 0.15.0 (same code, same API). Version numbers below that mention cubeforge are the old name.

Ranked by what they would win on the map, from profiles of the real app (`apps/web/bench`: a production
build in headless Chrome with the GPU, 1280x800, a saved world of seed 42 at tick 9000 with 172 people
and the same world with 3,000 more). Every item says where in the engine, what it costs today, what to
do, and how to see it. Numbers are from cubeforge 0.11.0 and 0.12.0 (the same code paths); "main thread"
is the share of one second the page's main thread is busy.

## Status on cubeforge 0.14.0 (October 2026): what is left, ranked

Crowd world at mid and close zoom, playing, on main before #298 (CPU profile of the 8.7 s window, `bench/profile-summary.mjs`).
The main thread was 14.8 % busy at mid and 15.5 % at close. The overall crowd figure after #296-#298 is 8.5-13.5 % busy
(`bench/RESULTS.md`). The 3 % target is not reached.

Engine code in the window (self time, share of the main thread's busy time):

| where | function | mid | close |
|---|---|---|---|
| `spriteLayerGL.js` | `gather` (every sprite of a dirty layer, culled ones too) | 119 ms, about 9 % | 96 ms, about 7 % |
| `spriteLayerGL.js` | `gatherBlind` (full pack when most of a layer is dirty) | 21 ms, about 2 % | 22 ms, about 2 % |
| `spriteLayer.js` | `drawOrder` (insertion sort, every frame on a `sortByKey` layer) | 18 ms, about 1 % | 18 ms, about 1 % |
| `spriteLayerGL.js` | `bufferSubData` and the uploads | about 13 ms, about 1 % | about 10 ms, about 1 % |

Ranked for the engine owner:

1. **`sortByKey` layers never take the incremental path.** `gatherRange` is skipped for them (`!layer.sortByKey` in the
   `draw` condition), so any dirty slot walks the whole layer and every sprite is visited, culled or not. The people
   body layer is the largest case. Ask: an incremental repack for `sortByKey` layers that keeps the draw order between
   frames, re-sorting only the keys that changed (`touchRange` already says which slots), or a per-span visit that skips
   culled spans.
2. **`gatherBlind` packs everything again.** It runs when more than 70 % of a layer is dirty for three frames. For a
   crowd that is most frames. Ask: a direct copy path for the all-visible case, or a rule that does not switch to blind
   mode when the dirty range is contiguous.
3. **`drawOrder` re-sorts every frame** even when no key changed. This is the old item 8 below; the same `touchKeys()`
   idea would remove it.
4. **Uploads are whole runs.** `bufferSubData` takes 1 %; a finer upload range would cut it, but it is small.

App-side costs in the same window (for the map, not the engine): the people animate loop over every person (about
4 % of busy), attached-sprite placement (about 3 %), the overlay's per-frame update (about 3 %), the simulation frame
merge (`merge.ts`, about 3 %), and the label painter (about 26 % before #298, which cut its per-frame sort; the painter
was still the largest app-side cost in this window).

Old items, status now:

- Item 1 (a retained layer buffer): `touchRange` is adopted (#296). The per-frame `gather` over the layer remains: see
  ranked item 1.
- Item 2 (polling the gamepad every frame): not seen in these profiles.
- Item 3 (whole-pixel wind): skipped on purpose (the map's trees use a driver).
- Item 4 (frame tables): not adopted; the app's atlases are full.
- Item 5 (zoom-aware text): adopted for names and thoughts in #297 (TextLayer, `zoomAware`), with no visible loss of
  crispness in the paused screenshots compared (mid and close). All engine textures together are about 22 MB.
- Item 6 (stats): still open. `textureBytes` misses dynamic canvases resized after registration, and `TileLayer`
  textures are not counted.
- Item 7 (dynamic canvases hold the pixels twice): `releaseAfterUpload` is in 0.14 but not yet adopted by the app.
- Item 8 (`drawOrder` every frame): see ranked item 3.

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

## 3. Wind that moves whole pixels (0.13 has the smooth kind)

`packages/renderer/src/spriteLayerGL.ts` (the `i_sway` branch of the vertex shader), `SpriteLayerWind`.

0.13's `SPRITE_SWAY` bends the top of the quad by a fraction of its height (`top * top * sin(...)`), which
smears a nearest-sampled pixel-art tree. The map's look is a canopy that shifts by *whole pixels*
(`cf/vegetation/trees-driver.ts`: `round(sin(t / 620 + phase) * amp + lean)`, trunk fixed), so the app keeps
rewriting a second layer of canopy-only sprites about 12 times a second (0.4 % of the main thread after the
throttle, 1.1 % before). Do: `wind.snap: true` (round the displacement to whole device pixels) and a
`wind.fromY` so only the part above that fraction of the sprite moves while the rest stays. Then the app
deletes the canopy layer and the driver's per-frame work.

## 4. Atlas frames: adopt only if packing gets tighter than the app's own

0.13 adds frame tables and up to 256 atlases per layer. The app's `CellAtlas` already packs uniform-cell pages
that grow by rows (24 MB of live textures for the standard world, down from 71 MB), so a frame table would only
win the last few MB (buildings, props and shore share a page instead of three; the 1 px gutter goes). Not worth
the rewrite until the remaining 24 MB matters; the content that is left is real (decor 1.75 MB after sharing
identical cells, mountains 4.7 MB: 9,770 distinct 10x12 cells).

## 5. Text on the map: TextLayer needs zoom-aware glyph resolution first

`packages/renderer/src/glyphAtlas.ts` (`GlyphAtlasOptions`, the atlas resolution), `textLayer.ts`.

The app draws names and thoughts with its own glyph atlas (`cf/overlays/glyph-atlas.ts`, `recorder.ts`):
every character is nine sprites (eight shifted outline glyphs and the fill), laid out again every frame; on the
crowd at close zoom that is `fillText` + `strokeText` + `emitRect` about 2.7 % of the main thread plus their share of
the sprite pass. `TextLayer` bakes the outline into the glyph (`outlineColor`, `outlineWidth`) and lays a run out
once, which would cut the text sprites about 9x. It is not adopted because the glyph raster has a fixed
resolution per style: the map zooms from 0.25 to 8, and the app's atlas keeps text crisp by choosing among four
raster sizes (9, 14, 22, 36 px per em) for the on-screen size. A `TextLayer` at 9 world px magnified 4x is blurry.
Do: let a style (or a layer) pick its raster size from a `resolution` the app updates as the camera zooms (rounded
to buckets so the atlas does not thrash), or draw glyphs from an SDF. Also missing for a drop-in: a per-run
outline colour/width without a style per combination.

## 6. Stats and timing

0.13 adds `stats.render.gpuMs` / `gpuMsAvg` (`setGpuTiming(true)` on the render system) and per-layer
numbers; the benchmark now records them (`GPU ms/frame`; 6 ms per frame on the crowd at close zoom). Still open:

- `textureBytes` and the upload counters ignore `TileLayer` textures and tint uploads, and
  `tileLayerStats` is not in `EngineStats`.
- `_statTex` counts a dynamic canvas's size when it is registered and never again, so after
  `ManagedDynamicCanvas.resize()` (the app's atlas pages grow by rows) `stats.textureBytes` is an
  undercount: 13.6 MB reported against 24 MB of live textures counted by wrapping `texImage2D` /
  `deleteTexture` (`bench/run.mjs --gl-log`). Do: update the stat in `uploadDynamicCanvas` where the size
  change is detected (`texW`/`texH` already change there).

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

## What The Human Box takes from 0.12 and 0.13

| Feature | Adopted | Why |
|---|---|---|
| Imperative dynamic canvases (`createDynamicCanvas`, `resize`, `dispose`) | yes (#288) | atlas pages are created when a cell size claims them and grow by rows: 109 textures / 71 MB of live WebGL textures became 44 / 24 MB, GPU process memory 220 -> 165 MB |
| GPU frame time in `EngineStats` | yes (bench) | GPU ms per frame is a column of the benchmark report |
| TextLayer | no | needs zoom-aware glyph resolution (section 5) |
| GPU sway (`SPRITE_SWAY`) | no | bends smoothly; the map's trees shift whole pixels (section 3) |
| Frame tables / 256 atlases | no | the app's grid pages already grow to what they hold (section 4) |
| `TileLayer` `minFilter: 'mipmap'` | no | the app's flat far-zoom tileset already hides the shimmer; swapping it changes the picture |
| `useCameraPanZoom` `onChange` | no | the camera controller already writes the camera inside the engine frame script, which runs only when the loop is awake; the render loops are woken from the same place |
| Picking (`pickNearest`, hit rects, string ids) | later | no performance gain; the app's footprint layer and `cf/picking.ts` work and are tested |
| `captureFrame` for "save a picture", `renderer="auto"` | later | behaviour, not speed; `renderer="auto"` also needs the canvas fallback to reach parity (it has no weather, heat maps, effects or labels) |
| Camera follow on a sprite, tile layers in the shared z-order (real heat tile layer) | no | the heat map is one 720 KB sprite; a tile layer would not change cost |
