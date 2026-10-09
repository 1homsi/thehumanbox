# Results: old canvas map against the current cubeforge map

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
