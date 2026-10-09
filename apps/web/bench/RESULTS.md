# Results: old canvas map against the current cubeforge map

> The engine is called xipjs from 0.15.0; every "cubeforge" below is the same engine under its old name (0.14.0 and earlier).

Headless Chrome 155 with the GPU (Metal), 1280x800 at DPR 1, 8 s windows after a 3 s warm-up, 2 runs per scenario,
interleaved build by build. Worlds: `standard` (seed 42, tick 9000, 172 people) and `crowd` (the same plus 3,000
people). **old** = commit `45a1ee5a`, the last canvas-painted map (with the `?bench` hook). **main** = `e6f0740f`
(cubeforge 0.14.0; the squash of #296, #297 and #298 is on main). The 1-minute load average while these runs were
going was 6-8 (the earlier results in this file were taken at 90-180, so they are not comparable with these).

Reproduce: `node bench/run.mjs --builds old=<dist-old>,main=dist --runs 2` (default passes: metrics, trace, memory),
then `node bench/report.mjs bench/results/old bench/results/main`.

## Frames, main thread, JS and GPU (old -> main, playing and paused)

| world | zoom | mode | fps | main busy % | JS ms/frame | GPU proc busy % | heap after GC MB | first frame ms |
|---|---|---|---|---|---|---|---|---|
| standard | overview | paused | 0 → 0 | 1.4 → 0.1 | - | 0.0 → 0.0 | 23 → 26 | 1071 → 1030 |
| standard | overview | playing | 30 → 56 | 20.5 → 12.9 | 6.53 → 2.06 | 42.1 → 5.2 | 26 → 29 | 1062 → 1029 |
| standard | mid | paused | 0 → 0 | 1.8 → 0.1 | - | 0.0 → 0.0 | 24 → 27 | 1064 → 1024 |
| standard | mid | playing | 29 → 59 | 18.1 → 12.3 | 5.64 → 1.81 | 34.8 → 6.5 | 26 → 30 | 1072 → 1322 |
| standard | close | paused | 0 → 0 | 1.4 → 0.1 | - | 0.0 → 0.0 | 24 → 27 | 1158 → 1054 |
| standard | close | playing | 30 → 60 | 13.9 → 11.6 | 4.13 → 1.71 | 21.9 → 5.4 | 26 → 29 | 1066 → 1028 |
| crowd | overview | paused | 0 → 0 | 1.9 → 0.1 | - | 0.0 → 0.0 | 87 → 88 | 2105 → 2083 |
| crowd | overview | playing | 30 → 60 | 36.2 → 8.5 | 11.42 → 1.17 | 54.8 → 4.8 | 88 → 89 | 2091 → 2059 |
| crowd | mid | paused | 0 → 0 | 1.6 → 0.1 | - | 0.0 → 0.0 | 87 → 88 | 2126 → 2058 |
| crowd | mid | playing | 30 → 60 | 45.3 → 13.1 | 14.47 → 1.97 | 67.6 → 4.3 | 89 → 89 | 2130 → 2074 |
| crowd | close | paused | 0 → 0 | 1.5 → 0.1 | - | 0.0 → 0.0 | 87 → 88 | 2110 → 2071 |
| crowd | close | playing | 30 → 60 | 43.0 → 13.5 | 13.87 → 2.05 | 64.9 → 4.0 | 89 → 89 | 2117 → 2080 |

main busy % is wall time in main-thread tasks (the median of two runs; the two runs agree within about 0.5 point
except where noted in the raw report). JS ms/frame is script time per frame drawn. GPU proc busy % is the GPU
process main thread busy in a Chrome trace. The old map is capped at 30 drawn frames a second; the main map draws
56-60.

**Against the crowd target** (3 % main-thread busy at 60 fps with 3,000 people): not reached. Main draws the crowd
at 8.5 % (overview), 13.1 % (mid) and 13.5 % (close) of a core while playing.

## Memory (Chrome memory dump, MB)

| build | world | zoom | GPU process | renderer process |
|---|---|---|---|---|
| old canvas | standard | mid, playing | 184 | 310 |
| main | standard | mid, playing | 135 | 277 |
| old canvas | crowd | mid, playing | 167 | 572 |
| main | crowd | mid, playing | 127 | 511 |

Main's engine textures (the map's atlases and text glyphs, from the engine's texture count) are about 22 MB in every
scenario. The old canvas map is not measured with that counter.

## What changed since the last table in this file

Main went from cubeforge 0.13 to 0.14 and gained three changes measured one at a time:

| change | what it does | crowd main busy % (before -> after) |
|---|---|---|
| #296 people touch ranges | people sprites touched only where a value changed | overview 9.1 -> 8.5, mid 17.0 -> 16.6, close 17.6 -> 15.1 (2 runs, noisy) |
| #297 names as a TextLayer | names and thoughts are text runs, not glyph sprites | mid 14.4 -> 13.8, close 15.3 -> 14.2 |
| #298 label draw order kept between frames | no full sort of the labels each frame | mid 14.5 -> 13.6, close 15.1 -> 13.5 |

A fourth change (a typed table instead of a Map and a Set for the crowd's name thinning) measured no better and was
not merged.

## Reading it

- Frames: the map now draws 56-60 frames a second in every playing scenario, against 30 for the canvas map.
- Main-thread time: a paused world is 0.1 % busy (the canvas map used 1.4-1.9 %). A playing crowd is 8.5-13.5 % busy
  against 36-45 % for the canvas map, a 3-5x reduction at a higher frame rate.
- JS per frame is 3-8x lower, and GPU process busy time is 5-13x lower.
- Memory: GPU process memory is 25-27 % below the canvas map, and renderer memory 11 % below it in both worlds.
- Not reached: 3 % at 60 fps with 3,000 people. The rest is mostly in cubeforge's per-frame layer pass and in the
  app's per-frame sprite and label passes; the profile and a ranked list for the engine are in
  `docs/ENGINE_REQUESTS.md`.

## Art streams: main against the commit before #307

Same harness, close zoom, playing, 3 runs, the two builds interleaved (`node bench/run.mjs --builds pre307=...,main=... --fixtures standard,crowd --zooms close --modes playing --runs 3`). `pre307` is the parent of #307 (the 24-look villagers). Medians of the runs.

| world | pre307 busy % | main busy % | JS ms/frame | GPU ms/frame | fps | texture MB | GPU process MB | instances |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| standard | 9.3 | 9.2 | 1.36 → 1.38 | 1.70 → 1.81 | 60 → 59 | 22.3 → 25.2 | 141 → 160 | 2,868 → 3,654 |
| crowd | 12.0 | 12.1 | 1.77 → 1.78 | 4.51 → 4.31 | 60 → 60 | 22.3 → 25.2 | 135 → 154 | 13,489 → 14,300 |

Main-thread and GPU time are flat within noise. The texture increase is the people atlas (about 1 MB to 3.9 MB, now 240 looks). The GPU process memory increase (about 19 MB in both worlds) is the texture plus the buffers of the new layers (tree dressing, cast shadows, yards); it is not split further. The instance count rises with the new layers.

## Audit after the feature wave: 4675e754 (0.4.47) against main (0.4.94)

Client, close zoom, playing, 3 interleaved runs per scenario, Chrome 155 with the GPU, 1280x800 at DPR 1, 1-minute load
average 31 to 35 (so the busy % spread is wide: the min-max is in the raw results). **old** = `4675e754`, **main** = `85061b44`
(the build before #466 and #470 below; main has since moved on).

| world | metric | old | main | change |
|---|---|--:|--:|--:|
| standard | main busy % (median, min-max) | 9.3 (8.6-13.4) | 12.4 (10.7-16.2) | +33% |
| standard | JS ms/frame | 1.36 | 1.83 | +35% |
| standard | GPU process busy % | 4.7 | 5.9 | +26% |
| standard | fps | 59 | 59 | |
| standard | engine texture MB | 21.2 | 24.8 | +17% |
| standard | GPU process MB | 132 | 153 | +16% |
| standard | JS heap after GC MB | 28 | 33 | +18% |
| standard | first frame ms | 1133 | 1635 | +0.5 s |
| crowd | main busy % (median, min-max) | 12.8 (12.2-15.6) | 16.7 (14.8-17.3) | +30% |
| crowd | JS ms/frame | 1.92 | 2.51 | +31% |
| crowd | GPU process busy % | 5.3 | 4.7 | -11% |
| crowd | fps | 60 | 60 | |
| crowd | engine texture MB | 21.2 | 24.8 | +17% |
| crowd | GPU process MB | 131 | 153 | +17% |
| crowd | JS heap after GC MB | 87 | 91 | +5% |
| crowd | first frame ms | 2755 | 3142 | +0.4 s |

Bundles (`pnpm run build`): `index` JS 168 kB to 259 kB (gzip 53 to 81 kB), `WorldView` JS 312 kB to 369 kB, the wasm
simulation 3.82 MB to 4.15 MB, CSS 107 kB to 109 kB.

**Where the main-thread time went.** A CPU profile of the crowd world at close zoom while playing (`--profile`,
`profile-summary.mjs`, same window for both builds) puts busy time at 13.6% for old and 18.4% for main under the profiler.
The growth is in the overlay renderer and the sprite layers, not the labels:

| part (inclusive ms in an 8.7 s window) | old | main |
|---|--:|--:|
| overlay renderer `update` (every layer, per display frame) | 416 | 662 |
| sprite layer `draw` (GPU sprite draw) | 192 | 274 |
| people sprites `animate` | 77 | 112 |
| footstep dust `observe` (new: O(people) per ground pass) | 0 | 68 |
| people labels | 279 | 290 |

Inside the overlay renderer the new per-frame painters are the largest parts: effects (`paintEffects` 40 ms), the HUD
(`paintHud` 38 ms), haze 19, falling blossoms 12, weather 11, plague haze 10. Those layers are rebuilt on every display
frame, not on change and not on the 15 Hz ground cadence. Not done yet (each needs its own measured PR): cadence or cache
for effects, HUD and roads; an index-based track table for footstep dust (its `Map<string>` is looked up for every person
on every 66 ms ground pass).

## Simulation audit: instructions per run, headless release, interleaved

`/usr/bin/time -l`, `instructions retired`, 3000 ticks (seed 42, seed 1337). Mean living people in brackets. The machine's
load was 20 to 150 during these runs, so cycle counts are noise and are not reported here.

| build | seed 42 | seed 1337 | note |
|---|--:|--:|---|
| 4675e754 (0.4.47, the last perf pass) | 57.2 G (117) | 63.4 G (127) | |
| 85061b44 (0.4.94) | 61.9 G (114) | 63.5 G (118) | +8% and flat: the feature wave |
| f587a2f4 (before #466) | 62.2 G | 63.6 G | |
| f587a2f4 + #466 family home | 55.5 G | 60.1 G | -11% and -6% |
| d708e8a0 + #470 neighbour scans | 62.0 G (vs 62.1) | 63.4 G (vs 63.7) | -0.3% standard; crowd phase -17% |

**Crowd.** 3,000 more people (the bench's crowd world, spawned at tick 9000) take a 3.5 ms tick to a 300 to 600 ms tick.
Over 20 ticks after the spawn the crowd phase cost 104.6 G instructions before #470 and 87.3 G after it (no-crowd run to
tick 9020: 251.7 G). The hosted default population limit is 350 (`sim/config.rs`), so this is far above what the hosted
world reaches; it is the stress case for the bench and for any "1,000+ people" goal.

**Remaining simulation costs (measured, not fixed, each changes the world or needs its own audit).**
- Road-aware route search: `movement::toward` / `plan_route` take 14% of samples in a 9000-tick run (8% at the baseline).
  The road step costs 6 against the heuristic's 10 per tile, which is not admissible, so the search expands further toward
  its 3000-node budget. Fixing it changes routes.
- Neighbourhood queries use 10-tile buckets. In the crowd a radius-6 query returns about 1,800 candidates. Four-tile buckets
  cut crowd-phase instructions by 41%, but the candidate superset changes, and some queries rely on the bucket slack that
  covers one tick of movement (the state hashes changed). A bucket change needs every query audited first.
- The family-home fix (#466) removed an O(people) scan and two string clones per living person per tick. Deaths outside the
  organism pass (battles, animal kills, disasters) still do not pass the home.
- Herds, flocks and fish schools are O(animals^2) per tick. At the animal counts in these worlds they are below 1% of samples.

**How the numbers were checked.** The baseline build was run twice and gave the same state hash each time (the save JSON,
sha256). #470 changed no hash on five runs (seed 42 at ticks 1500 and 4000 and with the crowd at tick 9020, seed 1337 at
4000, seed 7 at 3000). #466 changes the world on purpose; its own test covers the living-parent case.

## Performance stream: the client regressions from the audit, what was fixed

Continues the audit above. Every change below was measured on its own, on the bench's close-zoom playing windows (8 s), with instrumented section timings (`update()` sections and the painters' own marks, summed over the window with `--eval`), two or three runs per world, the two sides interleaved. The machine's 1-minute load average was 14 to 61 during these runs, so the section sums are inflated; the pairs were measured in the same run, and the ratios are what each PR claims. Main-thread busy % is not used as evidence for a single change: it swung by 6 to 9 points between identical builds that run.

| PR | change | standard, base -> after (ms per 8 s) | crowd, base -> after (ms per 8 s) |
|---|---|--:|--:|
| #476 | footstep dust reads the people's step clock, not a map of every person | observe 6-9 -> 3 | observe 88-105 -> 15-20 |
| #479 | look atlas: each colour's tint worked once (startup) | tint pass 49-73 -> 10-28 ms in Node, identical bytes | the same |
| #480 | heat map refreshes at most every 500 ms (the data changes, a setting does not) | heat 61-77 -> 15-21 | heat 8 -> 6-9 |
| #481 | haze paints only the banks the camera can reach | haze + stars 29-31 -> 4 | 19-26 -> 5 |
| #482 | effects (festivals, battles, wards, smog, beacons) and prayer bubbles only where the camera sees them | effects 39-42 -> 23-26; HUD 42 -> 27-28 | effects 48-49 -> 30-33; HUD 42-43 -> 28-33 |

Together the overlay's standard-world sections fall by about 105 to 125 ms per 8 s, against the audit's measured overlay growth of about 250 ms per 8.7 s. The crowd's labels (about 240 ms per 8 s) are untouched: that cost is per person in view, see below.

### Before and after (old 4675e754 against main at the end of this stream)

Close zoom, playing, 3 runs, the two builds interleaved, 1280x800 at DPR 1, Chrome 155 with the GPU. The 1-minute load average was 29 to 33 during the runs.

| world | metric | old 4675e754 | main (this stream) | change |
|---|---|--:|--:|--:|
| standard | main busy % (median, min-max) | 14.1 (10.4-15.1) | 11.5 (10.8-15.1) | -18% |
| crowd | main busy % (median, min-max) | 15.5 (13.4-15.8) | 16.8 (13.2-19.8) | +8%, within the spread |
| standard | fps (trace pass) | 59 | 59 | |
| crowd | fps (trace pass) | 60 | 60 | |
| standard | GPU process busy % (trace pass) | 5.0 | 4.8 | -4% |
| crowd | GPU process busy % (trace pass) | 6.4 | 5.2 | -19% |
| standard | GC ms per s, max pause ms (trace pass) | 2.4, 5.9 | 1.3, 1.9 | -46%, max -68% |
| crowd | GC ms per s, max pause ms (trace pass) | 2.0, 6.9 | 1.8, 3.3 | -10%, max -52% |
| standard | engine texture MB | 22.3 | 25.9 | +16% (the look atlas, not changed here) |
| crowd | engine texture MB | 22.3 | 25.9 | +16% |
| standard | first frame ms (median) | 1450 | 1843 | +0.4 s (not reproduced cleanly at this load, see below) |
| crowd | first frame ms | 2751 | 2886 | +0.1 s |

The main-thread busy numbers at this load are not precise enough to show a 1-point change; the section sums above are.

Bundles (`pnpm run build`, gzip in brackets): `index` JS 168,265 B (52.8 kB) at 4675e754, 259,621 B (80.8 kB) now; `WorldView` JS 312,456 B (110.7 kB) to 370,852 B (131.0 kB); the wasm simulation is unchanged at 3.82 MB.

### What was not fixed, and why

- **Crowd labels** (`people-labels.ts`, about 240 ms per 8 s with 3,000 people in view): the flags, thinning and drawing run for about 1,660 people per frame at 30 Hz. The per-frame work is per person, so it needs the label set to change less often, which moves what is shown. Not done.
- **Startup and first frame** (1450 to 1843 ms standard, noisy): the startup profile of main (57% busy in the first 1.4 s) has its largest named item in a grid-wide vegetation `rebuild` (a whole-grid mask pass, about 114 ms inclusive; the build is minified, so the source is not identified yet). The look atlas memo removes about 50 ms of the tint pass. A first-frame fix needs that item traced to its source and its own profile on a quiet machine.
- **Texture memory** (22.3 to 25.9 MB): the look atlas is 128 x 7680 RGBA (3.9 MB) for 240 looks. Shrinking it means fewer looks or palette rows, which changes the art. Not done.
- **Bundle** (index 168 to 260 kB): the index chunk is mostly the toolbar (tooltips, tool sprites, about 79 kB) and the panels (31 kB); the modals were already lazy. Moving the toolbar or panels later would delay the first paint of the controls. Not done.
- **React re-renders**: the React runtime is 2.9% of the startup profile and 0.1% of steady state (`react-vendor`), so there is no re-render storm to fix in the measured windows.
- **Engine gather** (`drawSpriteLayer`, 2.6% of wall time in the crowd profile): every overlay repaint still does `clear()` and `touch()` on its recorder layers, which makes cubeforge re-gather each one. A cubeforge change would be the fix; it does not clear the 3% bar on its own, so no engine PR.
- **Dew** (25 to 35 ms standard): a per-tile hash and `sin` over the visible grass at 15 Hz. Caching the glint positions per terrain revision would cut it; not done.
- **Route search** (`movement::toward`, the road heuristic): not attempted in this stream. Making the heuristic admissible changes routes, and the world-health check (mean alive at tick 9000 over 8 seeds) was not run.

### Rules this stream kept

Each change was measured on its own against the build it changed; the section sums were taken from instrumented builds that never shipped (the timing hooks were applied to a copy and reverted); the bench's own `busy %` was reported only where it was not the evidence.

## Performance stream, fourth shift: final numbers (#476 to #489)

The machine's 1-minute load average was 15 to 72 for every run in this section (other sessions shared it), so wall-clock figures are given as ranges and the deterministic counts carry the decisions. A full Chrome before/after bench was not re-run under that load; the busy and texture numbers below are from one profiled bench pass at 9a1a6e03.

### Merged in this shift

| PR | change | measured |
|--|--|--|
| #476 to #482 | overlay and effect passes (dust, atlas tint, heat map, haze, festival culling) | see the section above: standard overlay -105 to -125 ms per 8 s |
| #486 | scenarios and life-story dialogs load when opened, so Radix Dialog leaves the entry chunk | entry `index` JS 260,094 B to 215,711 B (raw -17%), gzip 81.3 to 66.6 kB; `WorldView` unchanged at 371 kB |
| #487 | dock tiles are memoized and the pick they call is stable; per-tab toolbar tests get an explicit 20 s budget | one click on a tile 2.6 to 3.2 ms to 0.08 to 0.10 ms (happy-dom); first render about 350 ms, unchanged; index +0.8 kB |
| #489 | route planner estimate 10 to 14 per tile of distance (weighted A*) | instructions over 3000 ticks -3.4% (seed 42) and -5.6% (seed 1337), three interleaved runs each; 8-seed mean alive at tick 9000: 138.9 to 142.5 (seeds 42 to 49), 143.0 to 143.8 (seeds 1337 to 1344); no extinctions, no unhealthy seed |

Interleaved wall-clock tick times for #489 (seed 42, 8000 ticks, three pairs, the same load): mean 9.95, 10.03, 11.65 ms for the baseline and 6.78, 7.09, 7.89 ms with the change; p95 25.3, 29.4, 34.8 against 14.8, 16.5, 13.8; max 49.9, 50.3, 148.4 against 38.3, 44.3, 82.9. These are the same runs under the same load, but the load was not controlled, so the instruction counts are the evidence and these only support them.

The admissible estimate (6 per tile, the road step) was measured first and rejected: 4 to 12% more instructions, because it weakens the pull toward the goal across open ground. The food-recipient test in `sim/agents/social/tests.rs` starved every third person to find recipients at tick 900; the new routes leave fewer in reach, so it now starves every second. The comparison and its threshold are unchanged.

### Where the time is now (busy and textures, 9a1a6e03, close zoom, playing, profiled pass)

| world | main busy % (two runs) | engine texture MB | first frame ms (two runs) |
|--|--:|--:|--:|
| standard | 13.6, 11.0 | 25.9 | 1997, 1263 |

### Startup profile (standard world, 9a1a6e03, `--startup-profile`, 2.04 s sampled, 56.7% busy)

The first frame's largest named items, from the sourcemapped build (inclusive, per the CPU profile):

- vegetation `update`: 219 ms (10.7%). Its parts: mountains `rebuild` 87 ms, trees `rebuild` 81 ms, decor `rebuild` about 11 ms self.
- cell atlas `bake`: 126 ms inclusive, of which canvas growth (`growPage` to `resize`) is 61 ms: trees 45 ms, mountains 16 ms. Each doubling copies the whole page.
- `gpu.ts` WebGL2 probe: 61 ms self. The probe creates a context and loses it before the engine creates its own.

Why these are not fixed: the mountains key includes the tile's absolute position, so no two tiles share a cell and a presize would be an exact count with no reuse. The trees' distinct variants are only known after the placement pass, so presizing them would over-allocate texture memory. The probe context can only be reused with a cubeforge change. Each item is about 3% of the sample, and each fix costs memory or an engine change, so none was made.

### Bundle, after #486 (attributed through the sourcemap, index chunk)

`sandbox.ts` 22 kB (minified), `tool-tips.ts` 20 kB, tool sprites about 24 kB across five files, `useSimulation.ts` 12.6 kB, `wire.ts` 9.9 kB. The tool sprites and tooltips are needed by the first toolbar render; moving them later needs the sprites painted asynchronously. Not done.

### Items not done, with the measurement that decides each

- **Texture memory (engine 25.9 MB):** the look atlas is 128 x 7680 RGBA, 3.9 MB, for 240 looks (24 villager looks plus pose frames). Shrinking it means fewer looks or palette rows, which changes the art.
- **Dew (25 to 35 ms per 8 s, standard):** only painted in the first fifth of the day, so it is 3% of a window's main-thread time only in morning windows. Caching the glints per terrain revision would help; below the 3% bar overall.
- **Crowd labels (about 240 ms per 8 s, 3,000 people):** the flags, the depth order and the name thinning are already cached between frames. No change that keeps every drawn label identical was found.
- **Wasm (3.82 MB in this copy):** the module has no name section and no producer debug data, so strip and panic settings have nothing to remove (panic on this target is not tested here). Code is 3.50 MB (92%). The data section is 310 KB: about 160 KB of gameplay text, 22 KB of panic-location paths and a few kB of messages; there are no debug or formatting strings. Smaller opt levels or `wasm-opt -Oz` trade tick speed, which the brief rules out.
- **Admissible route estimate (6 per tile):** 4 to 12% more instructions. Rejected in favour of #489.
- **Startup, GPU probe and atlas growth:** described above.

### Rules this stream kept

Every number above is from a build that was measured against its own baseline in the same run. Instruction counts (`/usr/bin/time -l`) were the decision for the simulation; cycle counts were not used, because under this load they moved in both directions by more than the change. The sweeps used the brief's world-health check (mean final alive at tick 9000 over eight seeds, no extinctions).
