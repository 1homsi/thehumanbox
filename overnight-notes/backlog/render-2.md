# Render drivers and scenes: second pass (RND)

Scope: `apps/web/src/game/render/**` (cf drivers, overlays, CfWorld / CfRoomView, camera and input glue, the 2D world fallback) and the room scenes that mount CfRoomView. Checked at origin/main `0172cdc7` (detached, research only, no code changed).

Excluded as already tracked: WEB-02 (ground rebuild on tile flips), WEB-06 (terrain resend cadence, perf side), WEB-11, WEB-12, WEB-13 to WEB-21, WEB-27, WEB-28, WEB-31, BUG-51, BUG-52, and anything in bugs.md / bugs-webui-2.md / recently merged PRs.

Ranked by expected user impact.

## RND-01 Hut, fire and campfire sprites lag the map by up to a terrain cycle (60 sim ticks)

- **Severity:** Medium (correctness: a burning hut keeps its hut sprite and glow, a new fire is not drawn, and a fire that went out keeps flaming, for up to 60 ticks)
- **Expected gain:** correctness; latency is 7.2 s at 1x (`WASM_BASE_TICK_MS = 120`), ~0.2 s at 40x, ~29 s at 1/4 speed.
- **Files:**
  - `apps/web/src/game/render/cf/buildings/special-tiles-driver.ts:103` (`tiles = world.grid.tiles`), `:117` (`specialTileIndex(tiles)`), `:144` (fire and campfire sprites), `:199` (hut sprites)
  - `apps/web/src/game/render/special-tiles.ts:16-36` (index cached by array identity)
  - `apps/web/src/simulation/wire.ts:669` (`tiles: wire.tiles ?? cache?.tiles ?? []`)
  - `apps/web/src/simulation/useSimulation.ts:277-283` (`gridCache` carried between frames)
  - `apps/web/src/game/render/cf/overlays/paint-ground.ts:159`, `overlays/eruption.ts:154` (the overlay reads the same tile kinds)
  - Sim side: `crates/sim-core/src/sim/storage/serialize/frame.rs:92` (`include_tiles = include_cold || tick % 60 == 0 || tick <= 1`), `grid.rs:866` (tiles are `None` otherwise)
- **Repro (by reading):**
  1. Sim ignites a hut (or a fire spreads onto a hut): the tile changes to `FIRE` in `grid.tiles` at tick N.
  2. Delta frames are built with `state_frame_incremental` (`include_cold = false`). `tiles` is `None` unless `tick % 60 == 0`, so the wire carries no tile grid.
  3. `applyGridWire` returns `tiles: cache.tiles`, the same array as before, and `specialTileIndex` (identity cache) returns the old index. Hut and fire sprites come from that index, so the old state is drawn until tick `60 * ceil(N / 60)`.
  4. Fire tiles also drive `fire_intensity` (sent every frame) but the flame sprite is chosen from the tile kind, so the flame is not drawn until the tile arrives.
- **Why it is wrong:** The big buildings (`world.buildings`) and the fire intensity grid are live, so a burning building shows its state immediately while a burning hut does not. This is the "stale sprite after a building burns" case. It is not caused by the render side; the render side only trusts the cadence the wire gives it.
- **Fix:** Either
  - (a) send tile changes in delta frames: a sparse list of `(row, col, tile)` for cells whose tile changed since the last frame (the sim already has `grid.set` as the single write point, so a per-tick dirty list is cheap), and have `applyGridWire` patch the cached `tiles` in place and bump a tile revision; or
  - (b) at minimum, derive the hut/fire/campfire sprite set from the sparse per-tick changes and keep the full tile grid on the 60-tick cycle.
  Then `specialTileIndex` must key on a tile revision, not array identity (identity is preserved on purpose by `applyGridWire`, which is why this goes stale).
- **Test:** Rust: in `sim/storage/serialize/tests.rs`, set a hut tile to `Fire` at tick 61, call `delta_frame`, and assert the tile change is in the frame (fails today). Web: `applyGridWire` with a cache and a delta that carries a tile patch, then assert `specialTileIndex` reflects it (needs a tile-revision key first).

## RND-02 The room view repaints the whole room and re-uploads its texture 60 times a second

- **Severity:** Medium (perf; every open interior, tavern, temple, forge, settlement and home view)
- **Expected gain:** per frame, the static floor and walls (about 880 canvas calls) disappear; the work left is the two sconces. Halves the CPU cost at minimum by running at 30 Hz, and a cached back layer removes nearly all of it.
- **Files:**
  - `apps/web/src/game/render/cf/scenes/CfRoomView.tsx:82` (`<Game>` without `mode`, so the engine default is `realtime`), `:190-205` (`frame()` runs every engine frame and repaints `paintBack` then `back.markDirty()`), `:242` (`<Script update>`)
  - `apps/web/src/game/render/cf/scenes/room-painters.ts:23-29` (`paintBack` = fillRect of the outside, `drawRoomFloor`, `drawFurniture`, `drawWalls`)
  - `apps/web/src/game/scenes/shared/room-draw.ts:127-149` (`drawRoomFloor`: 12 x 8 tiles, 4 to 5 fills each), `:162-181` (`drawWalls`, which ends with `drawSconce` x2)
  - `apps/web/src/game/scenes/home/HomeCanvas.tsx:514-520` (the same pattern for homes)
- **Measured (throwaway vitest, not committed):** one `roomPainter(...).paintBack()` with no furniture makes **484 `fillRect` and 402 `fillStyle` assignments**. At 60 fps that is about 29,000 rects and 24,000 style sets per second, with rgba strings re-parsed each time. The back canvas is 224 x 160 px, so each frame also re-uploads 143,360 bytes (8.6 MB/s) to the GPU.
- **Why it is wrong:** `realtime` mode never sleeps, and it repaints everything because two sconces flicker (`drawSconce` uses `t`). Floor and walls do not change. The engine's own `onDemand` mode and the render-loop sleep pattern used everywhere else in cf are not applied to the room.
- **Fix:**
  1. Bake the static back (outside, floor, furniture, walls without sconces) once per painter into a second dynamic canvas (or an offscreen canvas copied once).
  2. Per frame, draw only the sconce rects and the night dim over a cached copy, or move the sconces into their own small SpriteLayer (flames are 4 px squares; a 2-sprite layer is cheaper than a repaint).
  3. Use `mode="onDemand"` and wake at 30 Hz only while a sconce is lit (the flicker is `sin(t * 0.011)`, so 30 Hz is smooth).
- **Test:** Extend the throwaway counter above into a unit test on `roomPainter`: after the fix, a steady-state frame should make fewer than 10 `fillRect` calls and no `drawImage` of the floor. Also a render test that the room's `Game` is `onDemand` and that `markDirty` is not called when nothing moves.

## RND-03 A building layer emptied to zero keeps its pick footprints, so the map ghosts a burned building

- **Severity:** Low (a territory hover card is hidden over an empty patch; a click on it can resolve to a building id that no longer exists; a world reset to a world with no buildings keeps the old footprints)
- **Expected gain:** correctness only; no perf.
- **Files:**
  - `apps/web/src/game/render/cf/buildings/buildings-driver.ts:80-84` (empty path: clears `this.layer` and resets `this.sig`, but not `this.hits` or `this.ids`)
  - `apps/web/src/game/render/cf/buildings/buildings-driver.ts:64`, `:155-177` (the hits layer is only written on the non-empty path)
  - `apps/web/src/game/render/cf/buildings/CfBuildings.tsx:37-43` (`hits` layer, invisible)
  - Consumers: `apps/web/src/game/render/cf/input/map-click.ts:94-98` (`residentOf` returns null for a missing building, so the click falls through; harmless), `apps/web/src/game/render/hover/TerritoryHoverCard.tsx:71` (hover card hidden over the ghost)
- **Repro (by reading):** a world with one hut-sized building. Its last building is destroyed, so `world.buildings` becomes `[]`. The driver returns early after `layer.clear()`; `hits` still holds the last footprint rectangle. `pickBuildingAt` on that tile still returns the old id, and `TerritoryHoverCard` hides itself over empty ground.
- **Why it is wrong:** The early-return branch clears only the drawn layer, but the picking layer is a separate SpriteLayer that must agree with it. Other branches (`vis.length === 0`) resize both layers, so only the empty-list branch is inconsistent.
- **Fix:** In the empty branch, also `this.hits.clear(); this.hits.touch(); this.ids.length = 0; this.visible.length = 0; this.cells.length = 0`.
- **Test:** Vitest with a stub `SpriteLayer` (count / clear / resize / touch / pick) and a stub atlas: update with one building, then with `buildings: []`, and assert `hits.count === 0` and `ids.length === 0`. Not run: the stubs need the `describeBuilding` inputs, so this was confirmed by reading only.

## RND-04 Foam re-uploads every foam sprite whenever one of four pulse bands changes

- **Severity:** Low (perf)
- **Expected gain:** the layer is repacked in full at 30 Hz during any sustained pulse. Touching only the changed bands cuts the repacked range to the changed bands, roughly half of the layer at a typical pulse phase (two of four bands are above the alpha threshold at a time). Size of the saving depends on the foam rect count, which was not measured.
- **Files:** `apps/web/src/game/render/cf/ground/ground-drivers.ts:380-393`. The loop runs `layer.color.fill(color, starts[b], starts[b + 1])` per band and then one `layer.touch()` for the whole layer.
- **Why it is wrong:** The driver already knows each band's slot range (`starts[]`), and `SpriteLayer.touchRange(i0, i1)` exists for exactly this (`_pkg/renderer/spriteLayer.js:354`: only those slots are repacked and uploaded). `touch()` sets `_dAll`, which repacks every slot.
- **Fix:** Record the changed band ranges in the loop and call `layer.touchRange(starts[b], starts[b + 1] - 1)` per band (inclusive upper bound, as `attached.ts:155` does), instead of one `layer.touch()`.
- **Test:** A driver test with a stub layer: change one band's colour, assert the touched range is that band only (not `touch()`), and no touch when no colour changed.

## RND-05 The 2D world fallback keeps a 60 Hz rAF loop alive while nothing changes

- **Severity:** Low (perf on the fallback path only: it runs when WebGL is unavailable or has failed; the GPU path is already sleepy)
- **Expected gain:** an idle fallback map drops from 60 rAF callbacks a second to zero. The 30 Hz tick body (a template-string key and `JSON.stringify(viewFlags)` at `CanvasWorldFallback.tsx:104`) runs only when the key changes.
- **Files:** `apps/web/src/game/render/world-view/CanvasWorldFallback.tsx:87` (`if (!rendererPaused) raf = requestAnimationFrame(tick)`, scheduled before the early return), `:104` (key built every 33 ms), `:230` (first schedule).
- **Why it is wrong:** `render-loop.ts` says why this matters: "an idle rAF loop alone kept the main thread waking 60 times a second". This loop has the same shape: it reschedules unconditionally, and the throttle and early return only skip the work.
- **Fix:** Use `SleepyLoop` (`render/cf/render-loop.ts`) as the GPU path does: return `false` from the tick when the key is unchanged and the sim is settled, and let `wakeRenderLoops()` wake it. The fallback's `onFirstDraw` and error path stay as they are.
- **Test:** A test that the tick stops requesting frames after a settled frame and restarts after `wakeRenderLoops()`.

## Checked and dropped (so nobody redoes them)

- **Biomes, depth, roads and trails carried over after a world replacement:** the wasm worker forces a full frame on every in-session replacement (`wasmWorker.ts`: `retryResetStorage` emits `emit(true)`, the restore path `retryReadStorage` emits `emit(true)` when restored, and the recovery path at `:332` emits `emit(true)`), so the old terrain is replaced at once. Not a bug.
- **Biome window misaligned by the viewport origin:** in the wasm path the viewport is the whole world (`VP_W = WIDTH`, `VP_H = HEIGHT`, `grid.rs:14-15`), so `origin_x` and `origin_y` are always 0. Not reachable.
- **Equal z-index ties** (`PROPS_Z = 19` vs `PEOPLE_Z.afloat = 19`, `LANDUSE_Z = 15` vs overlay `Z.roads = 15`): the draw order at a tie is the engine's, not verified. Not reported.
- **Tree cast-shadow key ignores positions** (`vegetation/trees-driver.ts:305`): a rebuild with the same tree count and epoch would keep stale shadows, but no such case was found. Not reported.
- **Room `pickOccupant` and hover:** the `SpriteLayer.pick` path, the `hits` layer and the circle test agree (checked against `occupantAt`). No issue.
- **Camera / keyboard glue (`CfMapCameraController.tsx`):** listeners are removed on cleanup, the command-ref setter is restored, `blur` and `visibilitychange` clear the pressed keys. No issue found.
- **`useCellAtlas` dispose on unmount:** correct for production (no StrictMode in the app; `grep` found none). The double-effect issue exists only under StrictMode.

## Notes

- No code was changed. Test scratch files were removed; the worktree is clean. `apps/web/node_modules` was installed for the throwaway vitest and is gitignored.
- Measured: only RND-02 (canvas call counts from the throwaway vitest). RND-01, RND-03, RND-04 and RND-05 are confirmed by reading the code path end to end; numbers for RND-04 depend on the foam rect count, which was not measured.
