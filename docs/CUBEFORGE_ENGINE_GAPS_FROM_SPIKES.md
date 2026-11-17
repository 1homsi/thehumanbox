# Cubeforge 0.11.0: gaps found by moving The Human Box onto it

Five spikes each moved one area of the world view onto cubeforge 0.11.0 behind a
flag. This file merges the engine gaps they found, deduplicated and ordered by how
many spikes hit them and how much they block the migration. Each item says where it
was found and how sure we are:

- **Reproduced**: observed at runtime (a repro exists in the PR or its tests).
- **Read**: found by reading the shipped code; not run.

Draft PRs (all based on `feat/cubeforge-0.11`; the repro tests live in them):
#273 terrain (`TileLayer`), #274 camera / input / scenes, #275 people + animals
(`SpriteLayer`), #276 overlays / effects / HUD, #277 buildings / vegetation.
This replaces the audio claim in `CUBEFORGE_GAPS.md`: the app plays no audio.

What already works well and should be kept as is: `SpriteLayer` (12.9k sprites in
one draw), `TileLayer` tints and chunked uploads, `useScreenTint`, dynamic-canvas
sub-rect upload, `ParticleEmitter`, `StatsOverlay`, `useCameraPanZoom` parity.

## A. Bugs (fix first)

1. **`setTint` lost after `setTiles`/`fill` in the same frame.** (#273, reproduced on the GPU)
   `layer.setTiles(layer.tiles); layer.setTint(1, 1, 0x0000ffff)` leaves the old tint.
2. **`Line`, `Circle`, `Polygon`, `Gradient` render nothing on the WebGL path** (only the
   Canvas2D system queries them). (#276, reproduced)
   20 `<Entity><Transform/><Line endX endY color lineWidth/></Entity>` gave 0 draw calls.
3. **`usePostProcess` / `postProcessStack` has no effect on WebGL** (a vignette changed 0
   pixels); only `useWebGLPostProcess` works. (#276, reproduced)
4. **`onDemand` loop drops frames.** `SpriteLayer.touch()` / array writes do not wake it;
   `engine.loop.markDirty()` is ignored while a wake is already pending (`gameLoop.ts`
   `if (this.dirtyScheduled) return`). 3,000 people rendered 45 of 60 frames. `TileLayerData`
   has `onChange`, `SpriteLayer` does not. Also `markDirty()` before the loop starts is
   dropped. (#275 reproduced, #277 and #274 confirm)
5. **`SpriteLayer.image` is uploaded once and never refreshed** (repainting a canvas red
   to blue still showed red); only `dynamicSrc` updates. (#276, reproduced)
6. **`<Sprite width height>` prop changes never reach the ECS component** (a second sprite
   entity kept a stale 1152x896). (#277, reproduced)
7. **`Camera2D` resets the camera when an object prop (e.g. `bounds`) changes identity,**
   and with bounds larger than the view it pins to the top-left instead of centring.
   (#274, reproduced)
8. **`useCameraPanZoom` loses the travel before the drag threshold** (the drag trails the
   cursor by up to 6 px); no wheel-delta clamp, hardcoded 400 for page-mode deltas. (#274, reproduced)
9. **Touch default actions are cancelled on the engine canvas,** which probably stops the
   `click` that the default map waits for. (#274, read)
10. **Mipmaps regenerated on every draw** (`applySampling`, `webglRenderSystem.ts` ~1790)
    for mipmap filters. (#275, #277, read)

## B. Missing features that block the migration

1. **Tile layers always draw below all sprites, whatever `zIndex`.** `zIndex` only orders
   tile layers among themselves. Decor or heat overlays cannot sit above a world sprite.
   Heat overlays are invisible in the live app until the terrain is a `TileLayer`. (#276, #277, reproduced)
2. **Atlas limits.** Uniform grid only (no per-sprite UV rect, no cell padding or inset);
   max 8 atlases per layer; irregular atlases must be repacked. (#275, #277)
3. **Dynamic canvases only via the `useDynamicCanvas(w, h)` hook:** count and size fixed at
   mount, no imperative create / resize / free, so atlases cannot grow and the hook is
   called N times with explicit sizes. (#277)
4. **Per-layer instead of per-sprite state:** sampling (soft decals and pixel art cannot
   share a layer), anchor / pivot, tint and blend (`SpriteLayer` has no blend mode; the
   canvas is `antialias:false` so thin rotated lines alias). (#275, #276, #277)
5. **Text.** One texture and one draw call per `Text` entity: 1,000 labels cost 27 ms GPU
   and 50 ms CPU vs 1.6 ms / 0.4 ms for a glyph atlas; always drawn above all sprites; WebGL
   path ignores stroke, shadow, opacity, align, baseline and wordWrap; cache key ignores
   weight; text cache is a few hundred entries. Needs a bitmap/SDF text run on `SpriteLayer`
   that keeps z-order. (#276, #275)
6. **One screen-tint slot,** drawn after all sprites: cannot tint only the ground or tint
   under the people, or stack two tints. (#276, #277)
7. **Picking.** `pick()` hits the whole quad (transparent corners count), returns only the
   topmost sprite, has no radius or alpha test; ids are `Int32` (and `-1` means both miss
   and a valid id). Wanted: `pickNearest(x, y, r)`, `pickAll`, a per-sprite hit rect. With
   padded cells `pick()` found the right building in 17 of 96 tries, footprints in 96 of 96.
   (#275, #277)
8. **Depth sort.** float32 key (two depths 0.0001 apart at y=4000 collapse), no secondary
   key, `clear()`+`add()` forces a full sort every rebuild, hidden sprites still take part.
   (#275)
9. **Camera follow needs an entity id,** so a camera cannot follow people on a
   `SpriteLayer`. No camera-change callback (apps must poll every frame); only `onTap`.
   No `useFrame` although the `useDynamicCanvas` docs mention it. (#274)
10. **Atlas filtering.** Nearest only, no mips for tile or sprite atlases. The built-in
    averaged colour only applies below 2 device px per tile, but the app's minimum zoom on
    DPR 2 is about 3.2-3.7 px, so it never applies; overview shimmer 45% worse than the
    canvas (a flat-tileset workaround exists). (#273, #277)
11. **Tint is multiply-only,** can only darken; needs an additive bias or a per-tile
    brightness byte. (#273)
12. **No vertex-shader wind / sway:** per-sprite flag plus a time uniform would remove the
    per-frame CPU rewrite of canopy sprites. (#277)

## C. Smaller engine issues

- `Trail` costs one draw call per trail (20 trails = 21 draws). (#276, reproduced)
- Stats incomplete: `textureBytes` and upload counters ignore TileLayer textures and tint
  uploads; `tileLayerStats` not in `EngineStats`; `engine.stats` typed optional; no GPU
  time anywhere (callers wrap `activeRenderSystem.update` with timer queries); no
  per-layer breakdown. (#273, #276, #277, #275)
- `TileLayerData` has no public dirty-marking for in-place `tiles` writes (`touch()` /
  `markDirtyRect()`); imperative setters (`visible`, `x`, `y`, `zIndex`, `opacity`,
  `tileset`) only bump `revision` and do not wake an on-demand loop. (#273)
- Variants: ids share the atlas id space and are chosen by a fixed `tileHash`, so callers
  must import it to model the result; the 255-variant cap is undocumented. (#273)
- No `captureFrame()`: "save a picture of the world" is a black PNG on the GPU path. (#274, reproduced)
- `EngineContext` is not exported and there is no test entry. (#274)
- No canvas2d fallback in `Game` (the app's no-WebGL2 path cannot move onto it). (#274)
- `useSound` needs no `<Game>` but an app-level soundtrack needs it to survive remounts. (#274)

## D. App-side findings (Human Box, not engine)

- Keyboard panning stops after a click on the map (focus is on the engine canvas). Fixed in #274.
- "Save a picture of the world" is black on the GPU path. `?cf=picture` fixes it (#274).
- Touch taps probably never select people in the default map (#274, read).

## Suggested order for the engine owner

1. Section A bugs 1-6 (small, mostly one-liners with repros).
2. B1 tile-layer z-order and B3/B2 dynamic canvases and atlas UVs (these unblock terrain
   plus buildings plus overlays working together).
3. B7 picking and B8 depth sort (needed for click-to-select and large crowds).
4. B5 text runs, B4 per-sprite sampling/anchor, B6 tint slots.
5. Stats (C) and the rest.
