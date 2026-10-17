# Engine backlog (xip, as used by The Human Box)

Scout: read-only pass over `packages/renderer`, `packages/core`, `integrations/xip` on xip `origin/main` (`2351151`, then `ffe8a48`
after #57/#58). App: `xipjs ^0.15.0` (the rename of cubeforge), `<Game mode="onDemand">`, SpriteLayers for almost everything, one
TileLayer backend for terrain, one TextLayer for names.

How the numbers below were taken (so a worker can reproduce them):

- **CPU, headless**: `node benchmarks/run.mjs` (recording GL, everything on the CPU is real) plus a scratch script that drives
  `RenderSystem` with `SpriteLayer` / `TextLayer` (`scratch/scout.mts`, not committed; the scenario shapes are listed per item).
- **Real GL**: headless Chrome 155 on the M-series GPU (Metal), through `apps/web/bench/cdp.mjs`, a synthetic Human Box frame:
  10 static sprite layers of 3,000 (a third y-sorted) + a 3,000-sprite y-sorted crowd moving every frame (`touchRange`) + 300 text
  runs, 1280x720 DPR 1 or 390x844 DPR 3. GPU ms = `EXT_disjoint_timer_query_webgl2` (`stats.gpuMsAvg`). Builds A/B'd interleaved
  (3-6 launches each) under `bench-lock.sh`. The machine was shared (load 6-30), so absolute GPU ms drift between batches (the
  same build read 0.42 and 0.66 ms in two batches); only same-batch deltas are quoted, and the interleaved pairs are what count.
- The Chrome page timer is quantised to 0.1 ms, so CPU-in-browser numbers are means over 240-360 frames.

## Read this first: where the engine time actually is

1. **Engine CPU is already small.** One engine frame of the synthetic crowd scene (12 layers, 3,000 moving sprites) is 0.25 ms
   of main-thread JS on real GL; the headless scenarios are 0.07-0.15 ms for a 3,000-sprite sorted layer that moves every frame
   (`spritelayer-depth-3000` 0.148 ms). The app's profile (`bench/RESULTS.md`) puts the whole engine sprite pass at about 3 % of
   main-thread busy time of the 12-16 % total; `gather` + `gatherBlind` + `drawOrder` + uploads is about 11 % *of busy time*
   (about 1.5 points). So the three ranked items from `docs/ENGINE_REQUESTS.md` (ENG-08, ENG-09, ENG-24 below) are worth about
   1-1.5 points of main-thread busy together, not more. The rest of the 13 % is app JS (overlay renderer, labels, animate, merge).
2. **GL call count is not a cost.** 467 GL calls per frame for 8 one-atlas layers looks wasteful (137 `activeTexture`, 128
   `bindTexture`, all redundant), but in Chrome a `activeTexture`+`bindTexture` pair costs 0.04 us (8 pairs 0.35 us),
   `vertexAttribPointer` x10 0.4 us, `uniform2f` 0.02 us. 467 calls is about 10 us. A GL state cache is **rejected** (see the
   end).
3. **The vertex stage and the fill rate are what a toaster will feel.** On the M-series GPU a frame of the crowd scene is
   0.5-1.7 ms; the app's own bench reports 4-6 ms GPU/frame on the crowd. A 5-10x slower GPU turns that into 25-60 ms. The measured
   levers are ENG-01 (4-vertex quads, up to -50 % GPU), ENG-02 (DPR cap, -50 % GPU on a DPR-3 phone) and ENG-05/ENG-06 (the
   terrain tile layer is the most expensive single layer on a DPR-3 phone: +0.5..+1.5 ms of GPU on the M-series). They are ranked first for that reason.

## Status of the earlier lists on xip main

`docs/ENGINE_REQUESTS.md` "Status on cubeforge 0.14.0":

| item | status on xip main |
|---|---|
| 1 `sortByKey` layers skip the incremental path | **open**: `!layer.sortByKey` still gates `gatherRange` (`spriteLayerGL.ts:462`, `:469`). Another worker is on it (`wt/incremental-sprite-layer-sort`) = ENG-08 |
| 2 `gatherBlind` packs everything again | **open** = ENG-24 (tiny) |
| 3 `drawOrder` every frame | **open** = ENG-09 |
| 4 whole-run uploads | open, small (31 us per 252 KB); covered by ENG-21 |
| old 1 retained buffer, `touchRange` | fixed (#55) |
| old 2 gamepad polling | fixed (#49) |
| old 3 whole-pixel wind | fixed (#51), not used by the app |
| old 4 frame tables / 256 atlases | fixed |
| old 5 zoom-aware text | fixed (#52), adopted |
| old 6 `textureBytes` misses resized canvases, tile textures | fixed (#50, #42); one remaining stats leak = ENG-14 |
| old 7 dynamic canvases hold pixels twice | `releaseAfterUpload` shipped (#53); **app has not adopted it** (app-side, 43 MB of CPU backing) |
| old 8 lazy registration upload | measured: the blank `texImage2D(canvas)` is 5 us of JS (the copy is on the GPU process), so no gain; not an item |

`docs/CUBEFORGE_ENGINE_GAPS_FROM_SPIKES.md` / `CUBEFORGE_GAPS.md`: A1 `setTint` after `setTiles` (fixed, `tintsFresh`,
`tileLayerGL.ts:674`), A2 vector shapes on WebGL (fixed, `shapeGL`), A3 post-process stack on WebGL (`_applyEffectStack`), A4
`onDemand` wake for SpriteLayer (`SpriteLayer.onChange`, still **missing for TextLayer** = ENG-12; the coalescing quirk = ENG-20),
A5 `SpriteLayer.image` refresh (`imageVersion`), A9 touch (`touchPreventDefault`), A10 mipmaps regenerated every draw (fixed:
`_texSampling.mips`, `webglRenderSystem.ts:2066`), B1 tile z-order, B2 frame tables, B3 imperative dynamic canvases, B5 TextLayer,
B6 tint slots, B7 picking, B8 depth sort (Float64 + `sortKey2`), B9 follow a sprite, B10 tile mipmaps, B11 bias, B12 sway,
`captureFrame`, canvas2d fallback, GPU timing, tile stats: all in. Fixed upstream while I was reading: #57 (realtime loop died
after one tick error) and #58 (negative `dt`); #59 (fixed-step accumulation) is open. Context loss works (below).

## The backlog

Order: expected value per effort, GPU first (toaster), then CPU, then robustness. "App" = whether the app must change to
collect the gain.

### ENG-01  Draw sprite and text quads as 4-vertex triangle strips
- **Files**: `packages/renderer/src/spriteLayerGL.ts:256-258` (quad VBO, 6 vertices), `:1098` (`drawArraysInstanced(TRIANGLES, 0, 6, n)`);
  `textLayerGL.ts:104`, `:308`; same pattern in `webglRenderSystem.ts:1744-1747`, `:2195`, `:2210` (entity path) and `shapeGL.ts:493`.
- **Change**: store the quad as 4 vertices in strip order (`(-.5,-.5) (.5,-.5) (-.5,.5) (.5,.5)` with matching UVs / text `a_corner`),
  draw with `gl.TRIANGLE_STRIP`, count 4. No shader change, no data change. Keep the 6-vertex path for the tile page quad (one per page).
- **Evidence (measured, real GL, Chrome 155 Metal, interleaved, GPU timer)**: base -> strip, GPU ms/frame: crowd scene at 1280x720
  (7.1k instances) 0.544 -> 0.419 (-23 %); overview zoom (35.6k instances) 1.655 -> 0.972 (-41 %); 30k sprites with no JS culling
  0.927 -> 0.461 (-50 %); phone 390x844 DPR 3 (3.5k instances, fill bound) 0.788 -> 0.759 (-4 %). Main-thread CPU unchanged. The cost
  is per vertex (each of the 6 vertices re-fetches the 84-byte instance and runs the same math), so it scales with instance count.
- **Gain**: -20..-50 % GPU time on the instance-heavy frames (the app's crowd close zoom is 13-14k instances, overview 52k). It
  also cuts GPU-process busy %. Larger on a slower GPU (vertex bound earlier).
- **Size**: S (2 buffers + 4 draw calls + a test that decodes the recorded instances; `RecordingGL` counts `TRIANGLE_STRIP` draws as
  `count = 4`, so check `testing/recordingGL.ts` draw bookkeeping). **Deps**: none. **App change**: no.


### ENG-02  `maxDpr` / render scale on `<Game>`, then a GPU-time driven dynamic resolution
- **Files**: `integrations/xip/src/components/Game.tsx:202` (`dpr` state), `:508-523` (canvas size = `round(width * dpr)`);
  `webglRenderSystem.ts:2740-2744` (reads `canvas.width / clientWidth`), `core/src/stats.ts:84-86` (`gpuMsAvg`),
  `webglRenderSystem.ts:979-989` (`setGpuTiming`).
- **Change**: (1) `maxDpr?: number` (and `renderScale`) prop: `dpr = min(devicePixelRatio, maxDpr)`, CSS size unchanged, default =
  today's behaviour. TextLayer already follows `zoom * dpr` (`updateDensity`), tiles use `dpr` in `farZoomPx`. (2) `resolution="auto"`:
  turn `setGpuTiming(true)` on, and when `gpuMsAvg` stays above a budget (say 9 ms) for 30 frames step the DPR down (3 -> 2 -> 1.5 -> 1),
  step back up after 120 calm frames; resize the canvas only at those steps (it reallocates the back buffer).
- **Evidence (measured)**: same 390x844 CSS-pixel scene (3 tile layers + sprites + text), GPU ms/frame: DPR 3 = 2.255, DPR 2 = 1.116
  (-50 %, 1170x2532 vs 780x1688 pixels). An empty frame at DPR 3 costs 0.33 ms (clear + present). Back buffer: 11.9 MB at DPR 3, 5.3 MB at DPR 2
  (plus the same again for depth/stencil, ENG-16).
- **Gain**: about -50 % GPU time and -55 % frame memory on a DPR-3 phone for one step; the toaster case is exactly this (GPU bound,
  high DPR). Costs sharpness of text/sprites (nearest scaling of a 2x canvas on a 3x screen).
- **Status**: another worker has `wt/xip-maxdpr` (branch `maxdpr`) on the `maxDpr` part; the auto scaler is not started.
- **Size**: S for `maxDpr`, M for the auto scaler. **Deps**: none. **App change**: yes (`<Game maxDpr={2}>` or `resolution="auto"` in
  `WorldView.tsx:196`; check pixel-art crispness, set `image-rendering: pixelated` on the canvas style).


### ENG-03  Radix sort for the draw-order fallbacks (SpriteLayer and TextLayer)
- **Files**: `spriteLayer.ts:567-651` (`drawOrder`, comparator `fullSort` at `:641`), `textLayer.ts:343-369` (comparator sort at `:353`,
  insertion sort every frame), `TextLayer.sortKey` is `Float32Array` (`textLayer.ts:212`) while SpriteLayer's is Float64.
- **Change**: replace the comparator sort with an LSD radix sort on the sortable bit pattern of the Float64 key (4 passes of 16 bits;
  8 when `sortKey2` is set: sort by key2 first, then key, stable so the slot-order tie-break is free), into the preallocated
  `_order`. Same helper for TextLayer; make `TextLayer.sortKey` Float64.
- **Evidence (measured, Node, identical output order)**: 25,000 random keys: comparator 5.99 ms median / 22.7 ms p95 -> radix 0.44 ms / 0.94 ms
  (14x); 3,000: 0.42 -> 0.17 ms. Through `drawOrder()`: 25k keys all random 7.3 ms median (p95 42 ms), 10 % of keys moved far 3.5 ms (p95 26 ms),
  3,000 all random 0.44 ms. The fallback triggers whenever the order is far from sorted: a layer's first draw, a rebuild, a season change.
- **Gain**: removes 7-40 ms main-thread hitches when a 25k-sprite sorted layer (trees, props, buildings) is built or rebuilt; ×4-6 on a phone.
  Steady state (almost sorted) is unchanged.
- **Size**: S. **Deps**: none (complements ENG-08). **App change**: no.


### ENG-04  TextLayer layout cache (`clear()` + `add()` loses every layout)
- **Files**: `textLayer.ts:255-280` (`add` sets `_layouts[i] = undefined`), `:325-331` (`clear` drops them), `:377-405` (`layout`), `:466-568`
  (`place` allocates `lineStart/lineEnd/lineW` arrays and a new `Float32Array` per layout), `:295-323` (`removeAt` builds a 15-array literal per call).
- **Change**: a per-layer (or per-atlas) `Map` from `styleId|k|wrapW|align|lh|text` to an immutable `RunLayout` (shared glyph array),
  dropped on `atlas.generation` change, LRU-capped (~2k entries); runs point at the shared layout so `add`, `setText` to a seen string and
  slot reshuffles cost a lookup, not a layout. Use module scratch arrays in `place`. Replace the `removeAt` literal with a loop.
- **Evidence (measured, Node)**: 600 labels with unchanged text, rebuilt with `clear()`+`add()` every frame: 0.682 ms/frame; the same labels
  kept in place and moved with `set()`: 0.081 ms (8.4x). `textlayer-1000` (25 renames per frame): `place` is 11 % of self time and 4.1 MB of the
  allocation sample over 300 frames.
- **Gain**: 8x cheaper label rebuilds; the app's `PeopleNameLayer` keeps slots (`people-names.ts:55-75`) but `setText` into a slot that
  now holds another person's name relays out and allocates every time people enter/leave the view; with the cache it is a lookup.
  Expect tenths of a ms in a crowd; less garbage.
- **Size**: S. **Deps**: none. **App change**: no.


### ENG-05  Cache the terrain composite while the camera and the layer are still
- **Files**: `tileLayerGL.ts:391-496` (`drawLayers`), `:292-358` (`prepare` already knows when `revision` / animations changed),
  `webglRenderSystem.ts:3088-3092`.
- **Change**: for tile layers (or a group of them) flagged `cache`, render the visible range into an offscreen RGBA8 texture at canvas size
  the first frame the camera, zoom, DPR, shake, `layer.revision` and animated LUT are unchanged, then draw it as one textured quad until
  one changes. Invalidate on pan/zoom (no scrolling reuse needed for the first version).
- **Evidence**: measured (Chrome, M-series, GPU timer, 390x844 CSS px at DPR 3 = 1170x2532): an empty frame costs 0.32-0.41 ms (clear + present); one full-screen tile layer adds +0.47..+0.88 ms (random ids, no variants) and a layer with variants + tint + jitter (what the terrain layer uses) +0.84..+1.5 ms (two interleaved batches; the machine was shared). Three tile layers at DPR 3 added +1.3 ms to a 0.85 ms sprite frame. A one-quad blit of the cached texture costs about what the clear does.
- **Gain**: about -0.5..-1.2 ms of GPU per frame on a DPR-3 phone (the terrain layer is the single most expensive layer there) whenever the camera is still, which is the steady state of a watched village; x5-10 on a toaster GPU. No gain while panning.
- **Size**: M. **Deps**: none. **App change**: flag on the terrain layer; check whether it has animated tiles (the LUT
  changes every step and invalidates the cache).


### ENG-06  Tile shader: fewer dependent fetches per pixel
- **Files**: `tileLayerGL.ts:37-127` (`TILE_FRAG`), `:651-703` / `:771-840` (variants, LUT, index uploads).
- **Change**: bake the variant choice into the index texture on the CPU/GPU at upload (the hash depends only on the cell) so the shader does one
  index fetch plus the LUT only for animated ids; skip the `u_tint` / `u_bias` fetch via a per-page "has any tint" flag; compute `tileHash`
  only when `u_jitter > 0`.
- **Evidence**: measured cost of the shader as it is: +0.84..+1.5 ms per full-screen layer with variants/tint/jitter against +0.47..+0.88 ms for plain ids, so the variant, LUT and tint fetches are about 40 % of the layer. Reading `TILE_FRAG`: up to six dependent texel fetches per pixel (index, var head, var entry, LUT, atlas, tint) plus the hash. Not prototyped.
- **Gain**: estimate -0.3..-0.6 ms GPU per DPR-3 frame on the terrain layer; independent of ENG-05 and additive with it (the cache only helps when the camera is still, the shader diet also helps while panning).
- **Size**: M. **Deps**: none. **App change**: none (the terrain layer uses variants, tints and jitter).


### ENG-07  Visit only the visible cells when the camera moves over a static layer
- **Files**: `spriteLayerGL.ts:438-483` (view change triggers a full `gather`), `:723-903` (`gather` walks all `count` sprites, culls, repacks
  every position that shifted), `spriteLayer.ts` (a `static` hint or auto-detect "no dirty slot for N frames"), `:1030-1102` (`submit`).
- **Change**: when a layer has had no dirty slot for a few frames, build a coarse grid (cell = a few hundred world px) of slot lists kept in slot
  order; on a view-only change walk only the cells the view touches (visit slots in ascending draw order via the order of the cell lists
  merged, or for `sortByKey` layers whose key is world y, binary-search the key band) and rewrite only positions from the first one whose
  occupant changed. Do **not** "draw everything and let the GPU clip": that is measured below to cost more GPU than it saves CPU.
- **Evidence (measured)**: 30k static sprites (10 layers x 3,000, a third y-sorted), camera panning 400 px: engine CPU 0.567 ms/frame (Chrome real GL,
  mean); headless 25k sorted layer: pan 0.424 ms vs 0.006 ms with a still camera; 25k unsorted pan 0.292 ms; zoomed out to 0.25: 0.707 ms.
  Hack that disables all culling (draws every instance in slot order): CPU only -0.14 ms (the compare loop stays) but GPU 0.435 -> 0.984 ms
  (desktop) and 0.44 -> 1.20 ms (phone DPR 3) for 28k off-screen instances. So the cull has to stay on the CPU and become O(visible).
- **Gain**: pan and zoom frames -0.4..-0.55 ms CPU per 30k static sprites (the app has about 25k static sprites and 52k instances at overview,
  so roughly -0.5..-1 ms per panning frame; ×5 on a toaster), no GPU change. Still-camera frames are already 0.006 ms.
- **Size**: M. **Deps**: reuses the segment/run code ENG-08 touches; do it after ENG-08. **App change**: none if auto-detected; an optional
  `static: true` hint for drivers that already know.


### ENG-08  Incremental repack for `sortByKey` layers (already in flight)
- **Files**: `spriteLayerGL.ts:462` and `:469` (`!layer.sortByKey` gates `gatherRange`), `:675-717` (`gatherRange` assumes draw order == slot order),
  `spriteLayer.ts:567-629` (`drawOrder`).
- **Change**: see `docs/ENGINE_REQUESTS.md` ranked item 1; another worker has `wt/incremental-sprite-layer-sort` on it. Listed so the others
  can depend on it.
- **Evidence (measured, Node)**: 1 mover in a 3,000-sprite layer: unsorted 0.009 ms vs sorted 0.043 ms (4.8x); 10 % scattered movers unsorted
  0.058 vs sorted 0.071 ms; a driver calling `layer.touch()` on an unchanged layer: 3,000 sprites 0.057 (unsorted) / 0.065 ms (sorted),
  25,000 sprites 0.49 / 0.64 ms. Profile in `ENGINE_REQUESTS.md`: `gather` is about 9 % of busy time at mid zoom and it is the non-blind
  path of the layers that still call `touch()`.
- **Gain**: about 0.03-0.2 ms/frame depending on how many sorted layers are touched; the largest remaining engine CPU item, still small.
- **Size**: M (in flight). **Deps**: none. **App change**: the drivers that call `touch()` per change should switch to `touchRange` to collect it.


### ENG-09  `drawOrder()` from the touched slots only
- **Files**: `spriteLayer.ts:567-629`, `spriteLayerGL.ts:735`, `:917` (called every draw of a `sortByKey` layer).
- **Change**: do not re-run the O(n) filter, append scan and insertion pass when no key changed: reuse the dirty slots the layer already tracks
  (`touchRange`, or a `touchKeys()`), remove and re-insert just those slots by binary search + `copyWithin`.
- **Evidence (measured, Node)**: unchanged order costs 0.010 ms (3,000) / 0.081 ms (25,000) per call, every frame, for each sorted layer; all
  keys drifting by +-1: 0.035 / 0.54 ms. The app profile has `drawOrder` at about 1 % of busy time (18 ms per 8.7 s).
- **Gain**: about 0.03 ms/frame on the crowd, up to 0.1-0.2 ms with the app's 8 or so sorted static layers. Small.
- **Size**: S. **Deps**: overlaps ENG-08 (same code path); take them together. **App change**: none.


### ENG-10  Dirty run list instead of one `lo..hi` span
- **Files**: `spriteLayer.ts:171-172` (`_dLo`, `_dHi`), `:531` (`markSlots`), `spriteLayerGL.ts:445`, `:459-467` (`dHi - dLo < count >> 3` gate),
  `:675-717` (`gatherRange`).
- **Change**: keep up to 16 `[lo, hi]` runs (merge when overlapping or within 8), collapse to one span only beyond that. The incremental
  gate counts dirty slots, `gatherRange` iterates the runs.
- **Evidence (measured, Node)**: 3,000 unsorted sprites, 10 % scattered movers reported one slot at a time with `touchRange(i)`: 0.058 ms/frame;
  one mover: 0.009 ms (6x) because two distant slots make the span the whole layer and push it onto the full `gather`.
- **Gain**: up to about 0.05 ms/frame for layers with a few scattered movers (animals, glowing buildings, a crowd where few walk).
- **Size**: S. **Deps**: ENG-08 for sorted layers. **App change**: none (the people layer already reports per slot, #296).


### ENG-11  Move motion and animation to the GPU (per-instance velocity and frame clock)
- **Files**: `spriteLayer.ts` (new `setMotion(i, vx, vy)` / `anim` arrays), `spriteLayerGL.ts` vertex shader (`i_pos + i_vel * (u_time - t0)`, frame =
  `base + floor((u_time - t0) * fps) % count` for grid atlases), `webglRenderSystem.ts:2993-3000` (the layer version would stop moving every frame).
- **Change**: the app writes position, velocity and clip once per simulation tick; the engine interpolates and animates in the vertex shader, so
  there is no per-frame pack, upload or app-side `animate` / interpolation loop for the crowd. Sort keys update at tick rate.
- **Evidence (measured/read)**: headless all-moving 3,000 layer 0.109 ms/frame vs 0.053 ms with unchanged values; the profile in
  `ENGINE_REQUESTS.md`: `gather` + `gatherBlind` + `drawOrder` + uploads about 11 % of busy, plus the app's people `animate` 4 %, attached placement 3 %,
  the simulation-frame merge 3 %. Not prototyped.
- **Gain**: about -1.5..-3 points of main-thread busy at 3,000 people (-0.25..-0.5 ms/frame), GPU unchanged. The only item that moves the
  crowd target by itself; also the only one that needs a large app change.
- **Size**: L. **Deps**: ENG-21 helps; ENG-08 not needed. **App change**: yes, large (`people-sprites.ts`, `motion.ts`, `frame-clock.ts`).


### ENG-12  `TextLayer` has no `onChange`: on-demand loops are not woken by text-only changes
- **Files**: `textLayer.ts` (`add`, `set`, `setText`, `removeAt`, `clear`, `touch`, the opacity/tint/blend setters only bump `version`),
  `integrations/xip/src/hooks/useTextLayer.ts:25-35` (`SpriteLayer` has `onChange` at `spriteLayer.ts:240` and `useSpriteLayer` wires it; `TileLayerData` too).
- **Change**: add `onChange`, call it where `version++` happens, wire `engine.loop.markDirty()` in `useTextLayer`.
- **Evidence**: read (`grep onChange textLayer.ts` is empty; `docs/CUBEFORGE_GAPS_FROM_SPIKES` A4 fixed it for SpriteLayer only).
  The app wakes the engine itself (`frame-clock.ts` `wakeEngine`), so it hides this.
- **Gain**: correctness for any on-demand app using `useTextLayer` alone; no perf for the app. **Size**: S. **App change**: no.


### ENG-13  One-call sprite writer for rebuilt layers (`add` + five array writes per sprite)
- **Files**: `spriteLayer.ts:457-470` (`add`: `reserve`, `markSlots`, `reset` zeroing about 13 arrays, `changed()` = `version++` + `onChange?.()` per call),
  `:433-454` (`resize`, `reset`); app caller `cf/overlays/recorder.ts:296-335`, `:624-640` (`clear()`, then `add()` + `w/h/rotation/color/flags` writes for every rect and glyph, then `touch()`).
- **Change**: `addQuad(x, y, w, h, frame, color, flags, rotation = 0, atlas = 0)` that writes all fields once without the zeroing pass; call `onChange` once from
  `touch()` / a `beginRebuild()` + `endRebuild()` pair instead of per add.
- **Evidence (measured, Node)**: `clear()` + `add()` + 5 field writes per sprite: 2,000 sprites 0.014 ms, 8,000 sprites 0.102 ms; direct array writes after one `resize(n)`: 0.005 / 0.020 ms (5x).
- **Gain**: about 0.08 ms per 8,000 rebuilt sprites per frame (the overlay recorder rebuilds both of its layers every display frame; its real count is not measured here). Small; the app's own per-sprite logic is the larger cost.
- **Size**: S. **Deps**: none. **App change**: yes, small (`recorder.ts` call sites).

### ENG-14  Context restore leaves dead textures in the stats
- **Files**: `webglRenderSystem.ts:1653-1698` (`onContextRestored` clears the texture maps but not `_texBytes` / `stats.textureBytes`),
  `textLayerGL.ts:125-128` (`contextRestored` drops `pageTex` without calling `sink.free`); `update()` repeats part of the restore work at `webglRenderSystem.ts:2720-2725`.
- **Change**: reset `_texBytes`, `stats.textureBytes/Count` in `onContextRestored`; free the text pages through the sink.
- **Evidence (measured in Chrome with `WEBGL_lose_context`)**: after one lose + restore, `textureBytes` 4.76 MB -> 9.25 MB and `textureCount` 8 -> 12 with the
  same scene (stats only). Everything else is fine: sprites (image atlas), a dynamic-canvas atlas, a tile layer and a text layer all drew again, no
  exception, `update()` returned silently while lost.
- **Gain**: correct stats after a restore (the app's bench and any memory budget read them). **Size**: S. **App change**: no.


### ENG-15  Tile atlas average / mip build: one read, off the critical path
- **Files**: `tileLayerGL.ts:901-958` (`createAverageTexture`: a 2D canvas, `getImageData`, a JS loop, at every atlas upload), `:871-898`
  (`uploadMips`), `tileMips.ts:18-121` (`downsampleTileMips`) and `:107-120` (`buildTileMips`: a second readback).
- **Change**: read the atlas once and share it; take the average colour from the last mip level instead of a separate pass; build mips (and the
  average) in an idle callback / chunked or on the GPU (one box-filter render per level), keeping the first frame on nearest sampling.
- **Evidence (measured)**: 1024x1024 atlas, 16 px tiles: `getImageData` 1.9 ms + average 2.4 ms (at upload) + mips 9.5 ms (first minified draw) on the
  M-series; 2048x2048: 7.6 + 27.2 + 72.8 ms. All synchronous on the main thread.
- **Gain**: about 4 ms at load for a 1024 atlas (35 ms for 2048), and the 10-70 ms hitch at the first zoom-out if `minFilter: 'mipmap'` is
  ever adopted (the app uses nearest + `farZoomPx` today, so only the average path runs). ×3-5 slower on a phone.
- **Size**: M (S for the shared read). **Deps**: none. **App change**: no.


### ENG-16  Context without depth and stencil buffers
- **Files**: `webglRenderSystem.ts:1640`.
- **Change**: add `depth: false, stencil: false` (the renderer never enables either; `clear` is `COLOR_BUFFER_BIT` only, `gl.clear` at `:3038`).
- **Evidence (measured)**: GPU time unchanged (2.255 vs 2.229 ms at DPR 3, noise); the saving is memory: 4 bytes per pixel = 11.9 MB at 1170x2532, 3.7 MB
  at 1280x720 DPR 1 (computed, Chrome does not report it per context).
- **Gain**: -4 B/px of GPU memory (about -12 MB on a DPR-3 phone), nothing measurable in time.
- **Size**: S. **Deps**: none. **App change**: no.


### ENG-17  Allocate the entity-sprite and text batch buffers lazily
- **Files**: `webglRenderSystem.ts:327` (`MAX_INSTANCES = 16384`), `:860` (`instanceData` 16384 x 19 x 4 = 1.24 MB), `:1763-1765` (matching GL buffer),
  `textLayerGL.ts:8`, `:76`, `:109` (`data` 16384 x 14 x 4 = 0.92 MB plus a GL buffer of the same size).
- **Change**: allocate on first use (an app with only `SpriteLayer`s never touches the entity batch), grow in steps for the text batch.
- **Evidence**: read (sizes computed from the constants).
- **Gain**: about 4.3 MB (2.2 MB JS + 2.1 MB GPU) for a layers-only app. **Size**: S. **Deps**: none. **App change**: no.


### ENG-18  Detect software GL / performance caveat and tell the app
- **Files**: `webglRenderSystem.ts:1640` (`getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false })`),
  `integrations/xip/src/components/Game.tsx:208-225` (`renderer="auto"` fallback), `core/src/stats.ts`.
- **Change**: expose `stats.softwareRenderer` (UNMASKED_RENDERER matches SwiftShader/llvmpipe/Software) and a `failIfMajorPerformanceCaveat`
  option for `<Game renderer="auto">` so a machine with no GPU takes the canvas path (or the app drops to DPR 1) instead of running WebGL on the CPU.
- **Evidence**: measured: headless Chrome started with `--use-angle=swiftshader` returns a working WebGL2 context (`UNMASKED_RENDERER` = `ANGLE (Google, Vulkan 1.3.0 SwiftShader ...)`), `EXT_disjoint_timer_query_webgl2` is absent (`stats.gpuTimerSupported` null), and the page cannot tell it is on the CPU. How slow the scene is on it was not measured (`gl.finish()` does not block for it in that setup).
- **Gain**: a no-GPU machine is the extreme toaster; today it gets the full-resolution WebGL path on the CPU. The gain is choosing the cheaper path (the app already has a canvas backend behind `renderBackend`). Unquantified.
- **Size**: S. **Deps**: ENG-02. **App change**: yes (react to the flag).


### ENG-19  Glyph atlas: keep stale-density glyphs from forcing a full reset
- **Files**: `glyphAtlas.ts:130-171` (`style()` keys include `k`), `:262-293` (`alloc`), `:296-308` (`reset` clears every page and bumps `generation`),
  `textLayer.ts:243-253` (`updateDensity`), `textLayerGL.ts:196-206`.
- **Change**: when the density bucket changes, glyphs of the old bucket are dead weight in the shelf rows until the atlas is full; track rows per
  style and recycle rows of styles no layer uses any more, or reset eagerly at the density change (one visible re-layout) instead of mid-frame later.
- **Evidence**: measured (Chrome, a TextLayer with the app's three name styles, 111 distinct glyphs each, the density buckets the zoom path uses): density 1 -> 1 page, 333 glyphs, 16.9 ms for the first layout (51 us per glyph on the main thread); density 3 -> 1 page, 666 glyphs; density 8 / 24 (k = 4) -> 3 of the 4 allowed pages, 999 glyphs, no reset yet. Stale k = 1 and k = 2 sets stay resident, so the atlas sits at 3 of 4 pages with three styles and a Latin alphabet; one more style, accented or non-Latin names, or a fourth bucket resets it. Not triggered in this run, so the reset hitch itself is unmeasured.
- **Gain**: avoids a mid-frame full re-raster (every visible run re-laid out plus every glyph `fillText`/`strokeText` again on the main thread).
- **Size**: M. **Deps**: none. **App change**: no.


### ENG-20  `markDirty()` from a rAF callback that runs before the engine's loses every other frame
- **Files**: `core/src/loop/gameLoop.ts:71-77` (`if (this.dirtyScheduled) return`), `:171-204`.
- **Change**: add `loop.requestFrame()` that schedules the frame after the current rAF callbacks (what the app's `wakeEngine` does with a timer), or
  remember a `markDirty()` that was coalesced into a pending frame and schedule one more after it.
- **Evidence (measured, simulated rAF queue)**: a driver that re-registers its own rAF callback and calls `markDirty()` each display frame, registered
  before the engine's: 120 display frames -> 60 engine frames (30 fps). The app measured 45 of 60 and works around it in `frame-clock.ts:72-95`.
- **Gain**: correctness; lets the app delete `wakeEngine`'s timer and its up-to-1-ms delay. No perf by itself. **Size**: S. **App change**: optional cleanup.


### ENG-21  Compact instances (84 bytes -> about 40)
- **Files**: `spriteLayerGL.ts:15` (`FLOATS = 21`), `:62-131` (attributes), `:552-669` (`repack`, `same`), `:789-883`, `:992-1020` (pack loops),
  `:1105-1122` (`pointInstances`), `:1045-1101` (`submit`).
- **Change**: pack colour as `RGBA8` normalized, `colorAdd` as `RGB8`, rotation + flip + atlas + sway scale into one `uint32`, anchor from a
  layer uniform unless a per-sprite anchor exists, and compute the UV rect in the vertex shader from the frame index and per-atlas uniform
  arrays (grid atlases; keep the 4 floats for frame tables). 21 floats -> about 10 words.
- **Evidence (measured parts)**: a 3,000-sprite upload is 252 KB = 31 us of `bufferSubData`; the pack loop is the CPU cost of an all-moving layer
  (headless `spritelayer-depth-3000` 0.148 ms/frame, 0.056 ms of it is the app writing the arrays). Not prototyped; the GPU side (vertex fetch of
  126 floats per instance with 6 vertices) is the part ENG-01 already halves.
- **Gain**: estimate -35 % pack time, -55 % upload bytes, less vertex fetch: about 0.04 ms/frame at 3,000 moving sprites; more on a phone's bandwidth.
- **Size**: L. **Deps**: ENG-01, ENG-22 (same shader work). **App change**: no.


### ENG-22  Slim sprite programs (no wind varyings, fewer samplers)
- **Files**: `spriteLayerGL.ts:62-160` (one VERT/FRAG for every layer: wind math, `v_h`, `v_rect`, `v_shift`, an 8-way `switch` over
  `u_tex[8]`), `:318-340` (per-layer wind uniforms), `:1127-1141` (`bindGroup`).
- **Change**: compile variants by `#define`: `WIND` (only layers with `wind`), and the number of live atlases in the bound group (1, 2, 4, 8)
  so a one-atlas layer samples once. Drops 7 of 17 interpolated scalars for the common layer.
- **Evidence**: prototype (always-no-wind shader: no `i_sway` math, no `v_h`/`v_rect`/`v_shift`, on top of ENG-01) measured against ENG-01 alone, interleaved, 5 launches: overview GPU 1.050 vs 1.066 ms (phone) and 1.316 vs 0.875 / 0.972 vs 0.700 ms (desktop, two batches, noisy and not repeated), crowd frame no difference. Dropping `sin`/`cos` for unrotated sprites also showed nothing. **No gain demonstrated on the M-series GPU.** The case for it is tile-based mobile GPUs (varyings are written to memory per vertex; all 8 `texture()` branches of the `switch` can be executed), which this machine cannot show.
- **Gain**: unknown; verify on a Mali/Adreno phone before spending time. Rank last of the GPU items.
- **Size**: M (variant cache + tests). **Deps**: ENG-01 (do that first). **App change**: no.


### ENG-23  TextLayer: keep the packed batch when nothing changed
- **Files**: `textLayerGL.ts:189-288` (re-lays out every candidate, re-walks all runs once per atlas page, repacks and uploads every frame).
- **Change**: cache the packed batch keyed by `layer.version`, `atlas.generation`, the density bucket and a padded view rect; redraw the cached
  buffer while they hold.
- **Evidence (measured, Node)**: 2,000 unchanged runs: 0.19 ms/frame with a still camera and with a panning one (everything is re-done each frame).
- **Gain**: 0.05-0.2 ms on pan/zoom and paused frames with many labels; none while labels move every frame (the crowd). **Size**: M. **App change**: no.


### ENG-24  `gatherBlind`: stop packing the whole layer a second way
- **Files**: `spriteLayerGL.ts:445-476` (hot counter, 3 frames, mode switch), `:909-1027` (`gatherBlind`), `:446-453` (4 capacity-sized `fill` calls on the way back).
- **Change**: see `ENGINE_REQUESTS.md` ranked item 2: one pass that writes straight to `R.pos` for a fully dirty, mostly changed layer, keeping segments,
  without the three-frame hysteresis and the O(capacity) resets.
- **Evidence (measured/profile)**: `gatherBlind` is 21 ms per 8.7 s in the app profile (0.024 ms/frame, about 0.15 % of the main thread); the layers that are
  actually costly are the touched sorted ones (ENG-08).
- **Gain**: at most 0.02 ms/frame. Do it only inside ENG-08. **Size**: S/M. **App change**: no.


### ENG-25  Dynamic canvas `resize()` copies through a fresh canvas every call
- **Files**: `dynamicCanvas.ts:137-156`.
- **Change**: reuse one scratch canvas (or `getImageData`-free `drawImage` from an `OffscreenCanvas`), and grow in doubling steps so most growth needs no
  copy and the texture is re-specified less often (`webglRenderSystem.ts:1401-1407` re-uploads the whole canvas).
- **Evidence**: read; the app grows atlas pages by rows (`cell-atlas.ts`), each growth allocates a canvas the size of the page (4 MB at 1024x1024) and
  re-uploads it. Rare event, so small.
- **Gain**: fewer 4 MB allocations and uploads during atlas growth at load. **Size**: S. **App change**: no.


### ENG-26  Free the GPU buffer of a layer that stays hidden
- **Files**: `spriteLayerGL.ts:326` (`visible` false returns before anything), `:298-302` (`release` only on removal), `:526-541` (retained arrays at layer capacity).
- **Change**: after N hidden frames drop `R.pos`, the per-slot state and the GL buffer (84 bytes + about 30 bytes of state per slot of capacity);
  `retain()` rebuilds on the next visible draw.
- **Evidence**: read: 25,000 slots = 2.1 MB GPU + about 3 MB JS per layer; layers the app hides at some zoom levels keep it.
- **Gain**: several MB for each long-hidden big layer. **Size**: S. **App change**: no.

## Checked and rejected (so nobody spends the night on them)

- **GL state cache / fewer redundant `activeTexture`/`bindTexture` (467 calls per frame for 8 layers)**: measured in Chrome at 0.04 us per pair; the whole
  lot is about 10 us per frame.
- **Opaque layers with blending off**: prototyped on the tile layer (`gl.disable(BLEND)`), interleaved, 4 launches: 0.796 -> 0.966 ms and 1.292 -> 1.395 ms for one
  full-screen layer, 1.167 -> 1.963 ms and 1.914 -> 2.295 ms with variants/tint: noise or worse on this GPU. No gain, not an item.
- **Draw every static instance and let the GPU clip** (no JS cull): CPU -0.14 ms but GPU +0.55..+0.76 ms for 28k off-screen instances; the cull stays on the CPU (ENG-07).
- **Depth/stencil removal for speed**: no GPU time change (ENG-16 is memory only).
- **Blank `texImage2D(canvas)` on dynamic-canvas registration** (`ENGINE_REQUESTS.md` item 8): 5 us of JS, the copy is on the GPU process.
- **Per-frame allocations in `RenderSystem.update`** (iterator results from `Map.values()`, two closures per layer draw, the array literal of shape kinds,
  `world.query` rest arrays): 17 KB per frame in the headless profile (a scavenge every ~15 s). Not worth a PR.
- **ECS**: every `world.query` is a cache hit; the per-frame query set costs microseconds with no entities (the app has almost none).
- **`pickIndex` O(n)**: 0.5 ms for a miss on a 25k layer, called per click; `hasPivots()` scans frame tables on every draw and pick (1.9 us for a 4,000-frame
  table; the app uses grid atlases). Both real, neither worth an item.
- **Bundle**: tree-shaking is good (the app's import set is 257 kB min / 82 kB gz, no physics, no audio beyond 0.7 kB); `xipjs/render` instead of `xipjs` would save
  29 kB min / 8 kB gz (devtools 23 kB) but needs the app to drop `StatsOverlay`/`<Game debug>` from its imports. App-side, small.
- **`GameLoop` robustness** (a thrown tick killed the realtime loop, negative first `dt`): reproduced, then fixed upstream while I was reading (#57, #58).
  The app uses `onDemand`, which recovered from a throw anyway.
- **Touch listeners are non-passive**: matters only if the canvas allows page scroll; the app sets `touch-action`/`touchPreventDefault`.
- **Context loss**: tested with `WEBGL_lose_context` on the current code: an image-atlas sprite layer, a dynamic-canvas atlas layer, a tile layer and a text layer all
  redraw after restore with no error (and the ENG-01 strip build draws the same pixels). Only the stats leak (ENG-14).

## Which items need the app to change to pay off

ENG-02 (`maxDpr` / `resolution` prop on `<Game>` in `WorldView.tsx`), ENG-05 (flag the terrain tile layer, check its animations), ENG-11 (people/animals pipeline,
large), ENG-13 (recorder call sites, small), ENG-18 (react to the software-GL flag), ENG-08 (drivers that `touch()` per change should use `touchRange`).
Everything else is engine-only: ENG-01, 03, 04, 06, 07, 09, 10, 12, 14-17, 19-26.

## Suggested order for one night

1. ENG-01 (S, GPU -20..-50 %), ENG-03 (S), ENG-04 (S), ENG-02 `maxDpr` part (S + the app prop), ENG-14, ENG-12 as small independent PRs.
2. ENG-05 / ENG-06 (tile layer GPU), ENG-07 after ENG-08 lands.
3. ENG-11 only if someone wants the crowd target; it is the one item with a large app side.

