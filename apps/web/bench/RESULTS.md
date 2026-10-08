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
