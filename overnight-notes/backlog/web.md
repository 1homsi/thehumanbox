# Web client backlog (scout: apps/web at origin/main 9f2ebb8a, 0.5.74, xipjs 0.15)

Ordered by value per effort. Every number below was measured on this machine (headless Chrome 155 + Metal GPU,
1280x800 DPR1 unless noted, load average 15-60, so treat differences under ~10% as noise) with the repo's own bench
and a few node scripts on the wasm sim. Paths are relative to `apps/web/` unless they start with `crates/`.
"Std" = bench `standard` world (204 people), "crowd" = 3,200 people. Windows are 10 s unless noted.

## Baseline from the profiles (what the main thread actually spends)

- Std, mid zoom, playing: 10.4 % busy. App-owned: terrain/world step (`CfWorld`, registry) 2.3 %, overlay renderer 2.4 %,
  feed (flush + parse + merge) 1.1 %, people 0.6 %. Engine draw 2.0 %. Two long tasks (74 ms at load, ~100 ms at 8.8 s).
- Crowd, mid zoom, playing: 13.7 % busy. Overlay renderer 4.5 % (labels 1.7, trade network 0.4, hud 0.3, effects 0.3,
  ground effects ~0.7), engine 3.4 %, people 1.3 %, feed 0.9 %, GC 0.5 %. Allocation 348 MB per 10 s.
- 45 s standard run with `registry.stats()`: terrain revision went 0 -> 8 (one bump every ~6 s). Each bump re-runs ten
  ground drivers (~58 ms; 463 ms of the 851 ms the whole registry used). It also produced both long tasks.
- Renderer-process CPU is 20-25 % (std) and 74 % (crowd) while main-thread busy is 9-14 %: the rest is the wasm worker
  (crowd tick = 333 ms per tick in node, so the sim cannot keep up with its 120 ms tick). That is scout-sim's area, but the
  frame payload it builds is the largest client cost (items 1, 5, 6, 9).
- Phone proxy (390x844 @ DPR3): GPU time per frame 2.8 ms (vs 2.0 ms for 1280x800 @ DPR1; 1280x800 @ DPR3 is 4.8 ms).
  The engine renders at full devicePixelRatio, so GPU work scales ~9x with DPR 3.

## Items

### WEB-01  Stop shipping `vocabulary` on every organism in every full frame
- Files: `crates/sim-core/src/organism/organism/json.rs:956` (and the frame builder that fills it);
  `shared/constants.ts:87` (`lineageWord`), `ui/modals/LanguageModal.tsx:543-565`, `ui/modals/AllLineagesModal.tsx:74`,
  `shared/types/index.ts:100`, `simulation/wasmWorker.ts` (new request).
- Change: the vocabulary is ~5.8 KB of JSON per person and is only read to pick, per lineage, the most common word per
  concept (two modals). Compute those per-lineage words on request (worker message like `org_detail`) or once per full
  frame in Rust (`lineage_words`), and stop serialising `vocabulary` in frame organisms (it stays in `OrgDetail`).
- Evidence (node, wasm sim, `scout-tools/vocab.mjs`): crowd full frame 25.2 MB -> 7.4 MB, `JSON.parse` 218 ms -> 22 ms,
  retained heap after parse 123 MB -> 25 MB. Std 4.3 -> 3.3 MB, parse 22 -> 14 ms, heap 17 -> 11 MB. The crowd's 99 MB
  `heapAfterGc` in the bench is almost entirely these maps.
- Expected gain: -75 % heap in a crowd (-6 MB std), full-frame stall 218 ms -> 22 ms crowd; faster startup parse.
- Size: M (Rust change + two modals). Deps: needs a sim-crate owner; the web part is small.

### WEB-02  Do not rebuild the ground drivers when a fire, hut or mineral tile flips
- Files: `game/model/terrain-visuals.ts:25-39` (`terrainVisualSignature`), `game/render/cf/vegetation/terrain-watch.ts:20-62`,
  `game/render/cf/CfWorld.tsx:75-90`, drivers in `cf/ground/*`, `cf/vegetation/*`.
- Change: the signature hashes FIRE, CAMPFIRE, HUT and MINERAL tile ids, so every ignition, extinguish or new hut bumps
  `terrainRevision` and rebuilds shore, foam, accents, water plants, cattails, mountains, decor and trees. Only trees and
  decor read occupancy (they place on GRASS/FOOD/SAND/SNOW tiles only, `decorations.ts:150-157,355,420`). Keep two
  revisions: a ground one (water, biome, season: shore/foam/accents/water plants/cattails/mountains) and an occupancy one
  (trees, decor). Better still, make trees/decor re-place only the changed tiles' neighbourhood.
- Evidence: `registry.stats()` after 45 s std: `vegetation.revision 8`, 8 rebuilds each of decor (88 ms total), mountains
  (68), trees (90), shore (45), water plants (62), foam, accents, patches; whole registry 851 ms of 45 s. The profile shows
  a 100 ms task at 8.8 s made of these rebuilds. At 6x CPU throttle that is a 600 ms freeze every ~6 s.
- Expected gain: removes ~0.5 point of main-thread time and every >50 ms hitch except a real terrain change. For phones this is the
  biggest single jank source I found.
- Size: M. Deps: none (WEB-03 and WEB-04 are cheaper add-ons).

### WEB-03  `lakeCells` flood fill allocates an array per cell and reruns on every revision
- Files: `game/render/cf/ground/water-plants.ts:42-47` (`neighbours` literal per visited cell), `:124` (`buildWaterPlantRects`).
- Change: index arithmetic instead of the `[[r-1,c],...] as const` array, reuse `seen`/`stack`; cache the result by the
  water-only signature (only permanent WATER ids matter). Also hoist the `[...]` leader/crown arrays (see WEB-16).
- Evidence: std heap profile: `water-plants.ts` 98 MB per 10 s (the largest allocator in std); CPU profile: 19-29 ms self in the 100 ms
  hitch; `waterPlantsMs 62` for 8 rebuilds.
- Expected gain: -98 MB allocation per rebuild window, -15 to -20 ms per terrain bump (all of it if WEB-02 lands too).
- Size: S. Deps: none.

### WEB-04  Spread terrain rebuilds over frames
- Files: `game/render/cf/registry.ts:22-36`, `CfWorld.tsx:64-90`, `cf/vegetation/*-driver.ts`, `cf/ground/ground-drivers.ts`.
- Change: when `terrainRevision` moves, let the registry run at most N ms of driver rebuilds per step (round-robin by driver,
  keep the old sprites until the new ones are ready) instead of all ten in one task.
- Evidence: one revision = ~58 ms of rebuild work in one task (decor 11, mountains 8.5, trees 11, shore 5.7, water plants 7.8, ...);
  mobile run long tasks 140 ms. A season change additionally runs `writeAll` over the whole tile grid (`terrain-tiles/sync.ts:113-130`, not measured).
- Expected gain: no task over ~16 ms from terrain changes; matters mostly under CPU throttle/phones.
- Size: M. Deps: do after WEB-02 (fewer rebuilds) so the slicing logic stays simple.

### WEB-05  `grid.structure` is sent in every delta frame and re-applied from scratch
- Files: `crates/sim-core` frame builder (grid wire); `simulation/wire.ts:~529-560` (`take2D`, `applyGridWire`),
  `game/render/cf/ground/ground-drivers.ts:214-255` (`StructureDriver`).
- Change: send `structure` only when it changed (hash or per-tick dirty flag in Rust) and keep the previous grid on the
  client when absent. Client side, `applyGridWire` clears and refills `fire` and `structure` (2 x w*h) every frame; skip
  the refill when the triple list is identical to last frame's. `StructureDriver` scans the whole grid per sim frame; scan
  the sparse list instead, or skip when the source is unchanged.
- Evidence (node, `scout-tools/framekeys.mjs`): std delta frame 133 KB of which `grid.structure` 96 KB (72 %); crowd 410-673 KB
  of which 104 KB. Profile: `take2D` 17 ms and `StructureDriver.update` 24 ms self per 10 s (std); `structureMs 147` with 408 rebuilds in 45 s.
- Expected gain: -70 % of std delta bytes (JSON.parse ~0.4 ms -> ~0.15 ms per frame), -0.3 to -0.5 point main-thread.
- Size: M (Rust + client). Deps: Rust change; the client-only part (skip identical refill, sparse scan) is S and independent.

### WEB-06  The full frame re-sends the static terrain every ~36 s
- Files: `crates/sim-core` full-frame builder; `simulation/wasmWorker.ts:55-57,151-156` (`DEEP_FULL_EVERY_MS`),
  `simulation/wire.ts:~540-600` (`applyGridWire`), `terrain-watch.ts` (hash of a new `tiles` array).
- Change: grid terrain (`tiles`, `biomes`, `depth_map`, `fertility_dense`, `trails`) only when changed (version counter in Rust);
  otherwise the full frame carries the cold organism fields and lists only. Keep tile identity stable when unchanged so
  `TerrainWatch` skips hashing.
- Evidence: std full frame 4.4 MB of which grid 2.17 MB (biomes 352 K, depth_map 569 K, fertility_dense 511 K, tiles 365 K, trails 260 K);
  main-thread `JSON.parse` 22 ms (std, +validate/expand/merge ~30-50 ms task) every 36 s and once at startup.
- Expected gain: half the full frame, ~10 ms less hitch every 36 s; with WEB-01 the std full frame drops from 4.3 to ~1.2 MB.
- Size: M-L (Rust + client). Deps: Rust owner.

### WEB-07  Break the full-frame parse into several messages
- Files: `simulation/wasmWorker.ts:151-156`, `simulation/useSimulation.ts:226-260`.
- Change: the worker posts the full frame as separate JSON strings (grid, organisms, rest); the client merges them as they arrive
  across frames, so no single main-thread task parses more than a few hundred KB. Needs frame-id bookkeeping in `mergeFrame`.
- Evidence: std full-frame task ~50 ms (parse 22 + validate/expand/merge); crowd 218 ms parse alone (before WEB-01).
- Expected gain: long task -> several 5-10 ms tasks; useful only if WEB-01/06 do not shrink it enough. Do these first.
- Size: M. Deps: WEB-01, WEB-06 first, then re-measure.

### WEB-08  Merge allocates 52 MB per 10 s in a crowd
- Files: `simulation/merge.ts:10-48` (`mergeDefined`: `{...target}` + `for in` with dynamic keys), `merge.ts:81-110`,
  `simulation/wire.ts:185-304` (`expandOrgsSoa` builds an object per organism per frame, 19 MB), `merge.ts:~150` (`Array.from(caches.organisms.values())` per frame).
- Change: merge the SoA columns straight into the cached record (no intermediate `ExpandedOrgDelta`); create the new record with a
  fixed-shape copy (explicit field list, one hidden class) only for organisms whose hot fields changed; keep the list array stable
  when the roster is unchanged.
- Evidence: crowd heap profile: `merge.ts` 55 MB + `wire.ts` 32 MB of 348 MB per 10 s (25 %); CPU: merge 79 ms + parse/expand 25 ms per 10 s.
  Std: 36 + 81 MB (the 81 is mostly the one full-frame parse).
- Expected gain: ~-80 MB per 10 s allocation (-23 %), ~-0.5 point main-thread in a crowd, fewer GC pauses (56 ms per 10 s now).
- Size: M. Deps: none. Keep the `merge.test.ts` identity-reuse tests green.

### WEB-09  Delta frames resend `ids` and every thought each tick
- Files: `crates/sim-core` hot SoA builder; `simulation/wire.ts:7-48,185-304`.
- Change: send `ids` only when the roster changed (client keeps the last list), thoughts only for changes (it is meant to be sparse).
- Evidence: crowd delta 410-673 KB per frame: `organisms_hot` 288-300 KB of which `thoughts` 75-88 KB and `ids` 34 KB. Std: thoughts 3-5 KB, ids 2 KB (small).
- Expected gain: -35 % of a crowd's delta bytes/parse; nothing at std size. Low priority unless crowds are a target.
- Size: M. Deps: Rust.

### WEB-10  Cap the render resolution on phones (DPR 3 draws 9x the pixels)
- Files: `game/render/WorldView.tsx:~180` (`<Game width height>`), xipjs `components/Game.js:62,324-331` (physical size = css * dpr, no cap prop),
  `game/render/terrain-tiles/sync.ts:50`, `cf/vegetation/trees-driver.ts:347`, `CfOverlays.tsx:135` (they read `devicePixelRatio` themselves).
- Change: add a `pixelRatio` / `maxDpr` prop to the engine's `Game` (engine PR) and pass `min(dpr, LOW_PERF ? 1.5 : 2)`; make the other readers use the same capped value.
  Without the engine change, wrap `Game` in a CSS-scaled box (width/h divided by k, `transform: scale(k)`, `image-rendering: pixelated`), but touch coordinates must be mapped back.
- Evidence: bench GPU ms/frame: 1280x800 @1 = 2.04, @3 = 4.76 (pixels x9); 390x844 @3 = 2.77 (3.0 M px). A phone GPU is several times slower than this Mac's.
- Expected gain: -55 % pixels at DPR 2, -75 % at 1.5 on a DPR-3 phone; GPU time and fill rate follow. Pixel art stays acceptable at 2x.
- Size: M. Deps: xipjs engine PR (prop). Verify taps/zoom after the change.

### WEB-11  Overlay renderer re-records sections that did not change, at 30 Hz
- Files: `game/render/cf/overlays/renderer.ts:259-370` (`update`: roads, traffic, smoke, effects, hud, labels each `begin/end` every call),
  `CfOverlays.tsx:94-140`.
- Change: key each section by what it reads (`world.frame_id`, bounds, zoom, `viewFlags` slice, plus a time bucket for sections that animate)
  and skip re-recording when the key is unchanged; run time-driven sections (festivals, battles, prayer bubbles) at 15 Hz. `groundStatic`/ground already do this.
- Evidence: overlay `update` = 249 ms (2.4 %) in std and 479 ms (4.5 %) in a crowd per 10 s. Pieces: trade network 45 ms, hud 35, effects 30, `recorder` self 51-60 (crowd 51/std 60 ms),
  embers/eruption/plague ~60 (crowd), festivals/prayers/battles ~30. Heap: `recorder.ts` 42-45 MB per 10 s.
- Expected gain: ~1 point of main-thread in std, 1.5-2 in a crowd, ~-40 MB/10 s allocation.
- Size: M. Deps: none. Do WEB-12/13/15 inside it where they overlap.

### WEB-12  Trade roads are re-emitted as hundreds of rects per route at 30 Hz
- Files: `game/render/roads.ts:24-60` (`drawRoad`: a `fillRect` per sett or dash along the whole route), `game/render/base-parts/trade-network.ts:16-100`.
- Change: record the road geometry once per (`trade_routes` identity, era tiers, view bounds) into its own recorder layer and only redraw caravans/traffic each frame.
- Evidence: `trade-network.ts:16` 45 ms inclusive, `roads.ts:24` 37 ms per 10 s (crowd; std 19 ms self); 16 of the `fillRect` ms come from here.
- Expected gain: ~-0.4 point, fewer sprites submitted (the roads layer is repacked every frame).
- Size: S. Deps: easiest as part of WEB-11.

### WEB-13  `plagueSpot` allocates an object per sick person per ground pass
- Files: `game/render/cf/overlays/plague-haze.ts:44-60,64-92`.
- Change: compute radius/strength inline (no `PlagueSpot` object, no `ctx.save/restore` per pass when nobody is sick); keep the `plagueSpot` helper for tests.
- Evidence: crowd heap profile `plague-haze.ts` 28 MB per 10 s (`hv`), CPU 14-19 ms.
- Expected gain: -28 MB per 10 s in a plague crowd. Size: S. Deps: none.

### WEB-14  `Math.hypot` allocates (12 MB per 10 s in a crowd)
- Files: `game/render/cf/motion.ts:54`, `cf/overlays/recorder.ts:300-301,335-336,596`, `cf/people/people-labels.ts:236`,
  `cf/overlays/footstep-dust.ts:115`, `cf/input/map-click.ts:159`.
- Change: `Math.sqrt(dx*dx + dy*dy)`; in the recorder skip hypot/atan2 when the transform is identity (a=1, b=0, c=0, d=1).
- Evidence: crowd heap profile attributes 12.4 MB per 10 s to `hypot` (callers: `MotionStore.step` on every moving person each frame, recorder rects).
- Expected gain: -12 MB per 10 s (3.5 %), a little CPU. Size: S. Deps: none.

### WEB-15  Recorder colour parsing: per-frame `rgba(..., alpha)` strings thrash the colour cache
- Files: `game/render/cf/overlays/recorder.ts:280-300` (`emitRect`), `overlays/color.ts:80-90`, painters that build `rgba(255,255,255,${a})` each frame
  (e.g. `renderer.ts:497` `paintContested`, trade/effects painters).
- Change: let painters pass a packed colour + alpha (the recorder has `solid()` already) or cache by quantised alpha; keep `parseColor` for static strings.
  The cache returns a shared `Rgba` object but any fresh string still pays a regexp, `split`, `filter` and a `Map.set`.
- Evidence: `fillRect` 31.8 MB, `Map.set` 7.3 MB per 10 s in a crowd; `recorder.ts` 51 ms self.
- Expected gain: -30 MB per 10 s, -0.3 point. Size: S-M. Deps: pairs with WEB-11.

### WEB-16  People rebuild allocates closures and option objects per person
- Files: `game/render/cf/people/people-sprites.ts:529-535` (crown array literal per leader), `:537` (`glyph` closure per person),
  `:591` (`bar` closure), `cf/attached.ts:57-75` (`options = {}` default + `{ snap: true }` literals at ~12 call sites).
- Change: pass option bits as a number (`SNAP | UNTEXTURED`), hoist `glyph`/`bar` to methods taking `j`, `fa`, hoist the crown rect table.
- Evidence: crowd heap profile: `rebuild` 18.9 MB + `animate` 8.1 MB per 10 s (people-sprites 27 MB of 348); std 10.9 MB.
- Expected gain: -15 to -20 MB per 10 s, ~0.1-0.2 point. Size: S. Deps: none.

### WEB-17  `cssToRgba32` runs per person per rebuild
- Files: `game/render/cf/people/people-sprites.ts:451-499` (lineage colours, `bodyFill` strings including a template per person for the health view),
  `cf/colors.ts:40-50`.
- Change: a per-lineage numeric colour table (rebuilt when `lineage_id` set changes), numeric constants for the state fills, a small `healthColor(h)` that packs
  without building an `rgb(...)` string.
- Evidence: `rebuild` 30 ms per 10 s crowd (0.3 %); health view builds ~3,000 strings per rebuild; the colour cache clears at 4,096 entries.
- Expected gain: ~-0.1 to -0.2 point (more in the health/age views). Size: S. Deps: none.

### WEB-18  Name/label painter runs its full pass at the overlay rate
- Files: `game/render/cf/people/people-labels.ts:164-300`, `crowd-detail.ts:45-130` (`crowdLabelWinners`, `LabelPlacer`).
- Change: compute the on-screen list and name-thinning winners once per (orgs identity, zoom, coarse window) instead of per overlay frame; reuse
  `LabelPlacer` maps and the `prayerSpots`/`riders` structures; skip the first pass loop when the layer reports nobody visible with a label flag.
- Evidence: crowd `paintPeopleLabels` 182 ms inclusive per 10 s (100 self, `crowdLabelWinners` 28, LabelPlacer allocation 11 MB, 23.5 MB in `Dl`); std 10 ms.
- Expected gain: ~-0.8 point in a crowd (name thinning shown). Size: M. Deps: none; keep `people-labels.test.ts` references green.

### WEB-19  Allocation per overlay tick: `JSON.stringify(viewFlags)`, world and grid spreads
- Files: `game/render/cf/overlays/CfOverlays.tsx:106-135`.
- Change: key on `viewFlags` identity (the store replaces it on change), not a string; avoid `{...cur}` (about 80 fields) and `{...cur.grid}` by passing the pieces the frame needs.
- Evidence: static; 30 Hz string + two spreads. Small (not separable in the profile).
- Expected gain: ~-0.05 point. Size: S. Deps: none.

### WEB-20  Buildings driver rebuilds every visible building on every sim frame, allocating a record and strings per building
- Files: `game/render/cf/buildings/buildings-driver.ts:77-130` (signature includes `frame_id` and `tick`),
  `buildings/building-visuals.ts:59-110` (`describeBuilding`: ~6 template strings and a 20-field `record` object per building per call).
- Change: skip when the `world.buildings` identity, night bucket, detail, season flag and window are unchanged and nothing time-dependent (site stage, ruin age, passing state) can differ;
  build `record` only on an atlas miss; cache the key per building until its `condition/damage/...` change.
- Evidence: 410 rebuilds / 736 skips in 45 s std = 123 ms, `building-visuals.ts` 25 MB per 10 s in std (5.6 MB crowd).
- Expected gain: ~-0.25 point and -25 MB per 10 s in std. Size: M. Deps: none.

### WEB-21  Special tiles (fires, huts) rewritten every 30 Hz step
- Files: `game/render/cf/buildings/special-tiles-driver.ts:97-300`.
- Change: key on (animation frame index, night bucket, window, tiles identity); fires change frame every 170 ms, not every 33 ms. Reuse the `ruined` lookups.
- Evidence: 1146 updates, 93 ms in 45 s std (0.2 %); 8.8 MB per 10 s allocated (crowd), 9.1 MB std.
- Expected gain: ~-0.15 point. Size: S. Deps: none.

### WEB-22  Worker autosave stalls the simulation for 0.5-1 s and writes 23-53 MB to IndexedDB every 30 s
- Files: `simulation/wasmWorker.ts:188-224,411-415`, `simulation/wasmDb.ts`.
- Change: save at a longer interval or after the world changed enough, save on `pagehide`/hidden as now, and consider compressing the blob (fflate is already a dependency)
  or writing a delta. Run `serialize` in slices only if the Rust API allows it.
- Evidence (node): `sim.serialize()` 463 ms std (23.1 MB), 960 ms crowd (51.6 MB); the worker cannot tick or emit meanwhile, so the world freezes every 30 s.
  IDB write of the blob follows (flash wear and battery on phones).
- Expected gain: removes a visible 0.5-1 s stutter per 30 s and ~0.8 MB/s of disk writes. Risk: wider crash-loss window; keep the hidden/pagehide save.
- Size: M. Deps: product decision on the interval; Rust if slicing.

### WEB-23  Move frame decode + merge off the main thread
- Files: `simulation/useSimulation.ts:226-300` (flush in rAF), `wasmWorker.ts`, `simulation/merge.ts`, `state/worldStore.ts`.
- Change: the worker parses and diffs the delta (or Rust emits typed arrays), posts transferable SoA buffers for the hot columns; the main thread keeps only what the
  UI needs. At minimum run `flushUpdate` from the message handler/idle time rather than in rAF so it does not compete with the draw.
- Evidence: feed total 115 ms per 10 s std (1.1 %), ~100 ms crowd; `parseWorldFrame` self 42-72 ms, `take2D` 17.
- Expected gain: up to ~-1 point (std) once WEB-01/05/06/08 shrink the payload less is left; do those first and re-measure before committing to this.
- Size: L. Deps: WEB-01, 05, 06, 08.

### WEB-24  Vite config ignores `--outDir`; profiling builds fail and miss the preload tags
- Files: `vite.config.ts:11-20` (`path.resolve(__dirname, 'dist', 'version.json')`), `:35-40` (`distDir`).
- Change: use `config.build.outDir` (resolve it in `configResolved`) in both plugins; also replace `__dirname` (Vite warns it will break under native config loading).
- Evidence: `pnpm exec vite build --sourcemap --outDir dist-prof` aborts with ENOENT on `dist/version.json` in a fresh worktree (the documented "Reproduce a profile" recipe);
  with a pre-made `dist/` the build passes but `dist-prof/index.html` has no `thb-preload-sim` tags, so profiled startup differs from production.
- Expected gain: tooling correctness for every profiling worker. Size: S. Deps: none.

### WEB-25  Bench has no camera-motion scenario
- Files: `bench/run.mjs`, `game/render/bench-hooks.ts` (`command` supports look-at/zoom).
- Change: add a `--modes panning` scenario (steady pan across the town for the window; optionally a zoom sweep) that reports the same metrics and long tasks.
- Evidence: all current scenarios hold the camera still, so every sig/window-keyed rebuild during a pan (buildings `win`, trees window, decor, overlay key) is unmeasured
  although panning is what a phone user does most.
- Expected gain: unlocks measuring items 11, 20, 21 under real use. Size: S-M. Deps: none.

### WEB-26  Startup main-thread work: ~490 ms before the first frame (std)
- Files: `cf/atlas/cell-atlas.ts:151` (`bake`), `cf/people/people-looks.ts:88,141`, xipjs `tileLayerGL.createAverageTexture` (20 ms), `dynamicCanvas.resize` (24 ms),
  `terrain-tiles/sync.ts` first `writeAll`, decor/mountains/trees first rebuild.
- Change: spread the first rebuilds and atlas bakes over a few frames behind the loading cover, bake the people sheet lazily by row, avoid resizing dynamic canvases repeatedly.
- Evidence: startup cpu profile (navigation -> first frame, 1.2 s): 39.7 % busy; top self: `resize` 24, `createAverageTexture` 20, `wire` 18, GC 16, `bake` 13, people-looks 16, ground drivers 10-15. React render 25 ms.
  Worker side (node): `Sim.fromSerialized` 237 ms std / 445 ms crowd, first full frame 53 / 321 ms, off the main thread.
- Expected gain: ~0.2-0.3 s of main thread at desktop speed, ~1.5 s at 6x throttle. Size: M. Deps: none.

### WEB-27  Animals layer touches the whole layer every animate
- Files: `game/render/cf/animals/animal-sprites.ts:250-313` (`body.touch()`, `sleep.touch()`, `shadow.place`).
- Change: use `storeF32`/`touchRange` like people so still animals cost no upload; same for `sleep`.
- Evidence: `animate (animal-sprites.ts:250)` 9 ms per 10 s; engine repacks the layer each 30 Hz tick. Small.
- Expected gain: ~-0.1 point in animal-heavy zoomed views. Size: S. Deps: none.

### WEB-28  Heat map copies its RGBA buffer on every refresh
- Files: `game/render/cf/overlays/renderer.ts:560-566`.
- Change: keep one `ImageData` over `heat.rgba` (or write into its `.data`) and `putImageData` that.
- Evidence: static; a w*h*4 copy every 500 ms with an overlay on (not measured; the profiled runs had no overlay).
- Expected gain: -0.7 MB allocation per refresh. Size: S. Deps: none.

### WEB-29  Desktop/native path decodes gzip + msgpack on the main thread
- Files: `simulation/binary-frames.ts:12-19`, `simulation/wire.ts:~310-330`.
- Change: decode in the worker (or `DecompressionStream` + a worker for msgpack), hand `expandOrgsSoa`/merge the result.
- Evidence: not measured (web build uses JSON from the wasm worker); the native frame is the same payload (see items 1, 5, 6, 9, which cut it at the source).
- Expected gain: unknown; desktop only. Size: M. Deps: WEB-01/05/06 first.

### WEB-30  Idle: the headline/action tickers animate forever
- Files: `styles/app/00-base.css:155-170` (`thb-ticker 60s linear infinite`, `will-change: transform`), `styles/app/03-history-orgdetail-ticker.css:300-340`.
- Change: pause (`animation-play-state: paused`) when the sim is paused, the tab is hidden, or there is nothing to scroll; honour `prefers-reduced-motion`.
- Evidence: weak. Paused scenario: main thread 0.86 %, renderer process 1.1 %, GPU 0.9 %, but the browser process showed 8.6 % (noisy, load average ~30; playing runs show 0.7-8.8 %).
  Needs an A/B with the ticker disabled before it is worth a PR.
- Expected gain: unknown, likely a few % of the compositor/browser process while paused. Size: S. Deps: A/B first.

### WEB-31  Render loops keep scheduling rAF when `document.hidden`
- Files: `game/render/cf/CfWorld.tsx:~114`, `cf/overlays/CfOverlays.tsx:95`, `cf/frame-clock.ts:~61`, `cf/render-loop.ts:55`.
- Change: return `false` when hidden (the `visibilitychange` listener already wakes every loop).
- Evidence: static. Browsers stop rAF in hidden tabs so the web gain is ~0; Electron windows with background throttling off (or occluded windows) may keep spinning.
- Expected gain: desktop idle only, unmeasured. Size: S. Deps: none.

## Checked, not worth a PR (so nobody redoes it)

- Wasm size: 4.86 MB raw / 0.98 MB brotli (3.8 MB a few weeks ago). `wasm-opt -O3` and `-Oz` on the built module give 977 K / 978 K brotli, no gain. The growth is code, not flags.
- React re-render storms: `world` reaches React at 2 Hz and the selectors are already narrow. React inclusive time is 20-27 ms per 10 s, App render 13 ms. The O(n) `filter`/`find`
  passes in `App.tsx:421,591,612-655` cost ~0.1 %. Not worth touching until everything above is done.
- Startup JS: PostHog is already lazy and skipped for the wasm web world; Shepherd (`tour-runner`), the modals, the canvas fallback and `SceneView` are separate chunks.
  Entry is 220 KB (68 KB gz) + React 220 KB, WorldView 385 KB (137 KB gz). Startup is bound by wasm + world restore, not by JS.
- Hidden tab: the sim worker already pauses on `visibility` and saves; the only timers left are the 8 s random tour, the 250 ms sky overlay (while active), the version poll.
- `heapAfterGc` standard 36-41 MB, mostly org records; crowd 99 MB is WEB-01.
- Interleaved A/B was not run: this is a scouting pass, no code was changed. Each PR must A/B with `bench-lock.sh` as the brief says.

## How to reproduce / tools

- Worktree built at `overnight/wt/scout-web` (removed at the end). `apps/web/src/wasm/sim-core` is gitignored: `make wasm` took 4 min 14 s under load; a stale copy from the main checkout builds but is older.
- World saves for the bench are cached in `overnight/shared-bench-cache/` (copy to `apps/web/bench/.cache/` to skip the two-minute generation).
- Node helpers in `overnight/scout-tools/`: `framekeys.mjs` (payload size by key), `simcost.mjs` (tick/frame ms), `vocab.mjs` (vocabulary cost), `ser.mjs` (save cost), `span.mjs` (hot spots in a time slice of a cpuprofile),
  `combo.sh` (the runs behind this file, under one lock hold). Usage: `node --expose-gc vocab.mjs <wasmDir> <save.bin> <label>`.
- Profile commands used: `node bench/run.mjs --builds prof=dist-prof --profile --alloc-profile --gl-log --fixtures crowd --zooms mid --modes playing --passes metrics --runs 1 --window 10000`
  and the same with `--fixtures standard`; 45 s run with `--eval 'JSON.stringify(window.__thbCf.registry.stats())'`; `--size 390x844 --dpr 3`; `--startup-profile`.
