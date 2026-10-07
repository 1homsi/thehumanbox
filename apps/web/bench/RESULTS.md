# Results: old canvas map against the cubeforge map

Headless Chrome 154 with the GPU (Metal), 1280x800 at DPR 1, 8 s windows after a 3 s warm-up, 2 alternated runs
per scenario, medians. Worlds: `standard` (seed 42, tick 9000, 172 people) and `crowd` (the same plus 3,000 people).
**old** = commit `45a1ee5a`, the last canvas-painted map (with the `?bench` hook patch). **after** = main at
`8044af46` (cubeforge 0.13.0 with the optimisations of #284-#289). The machine was shared with other jobs
(load average 90-180 for the whole run), so every absolute number is inflated alike; builds ran interleaved
scenario by scenario, so the comparison holds. Reproduce: `node bench/run.mjs --builds old=<dist>,after=dist --runs 2`.

## Frames delivered, main thread, JS, GPU, memory (old -> after)

| world | zoom | mode | fps | main busy % | main CPU % | JS ms/frame | GPU proc % | heap after GC MB | first frame ms |
|---|---|---|---|---|---|---|---|---|---|
| standard | overview | paused | 0 → 0 | 1.0 → 0.0 | 1.2 → 0.1 | - | 0.0 → 0.0 | 23 → 26 | 1505 → 1718 |
| standard | overview | playing | 30 → 56 | 26.2 → 28.1 | 32.5 → 24.3 | 8.24 → 4.50 | 49.7 → 11.4 | 26 → 29 | 1685 → 1559 |
| standard | mid | paused | 0 → 0 | 0.9 → 0.0 | 1.0 → 0.1 | - | 0.0 → 0.0 | 24 → 26 | 1628 → 1523 |
| standard | mid | playing | 30 → 59 | 24.1 → 18.0 | 29.7 → 17.8 | 7.48 → 2.79 | 34.8 → 8.5 | 28 → 30 | 1639 → 1477 |
| standard | close | paused | 0 → 0 | 1.0 → 0.1 | 1.2 → 0.1 | - | 0.0 → 0.0 | 24 → 26 | 1526 → 1561 |
| standard | close | playing | 30 → 59 | 17.3 → 15.6 | 20.0 → 15.5 | 5.37 → 2.37 | 23.7 → 7.5 | 27 → 29 | 1402 → 1353 |
| crowd | overview | paused | 0 → 0 | 1.1 → 0.1 | 1.2 → 0.1 | - | 0.0 → 0.0 | 86 → 86 | 2831 → 2494 |
| crowd | overview | playing | 30 → 60 | 44.3 → 17.7 | 59.2 → 17.2 | 14.04 → 2.69 | 58.8 → 8.2 | 91 → 88 | 2412 → 2197 |
| crowd | mid | paused | 0 → 0 | 1.0 → 0.0 | 1.1 → 0.1 | - | 0.0 → 0.0 | 87 → 87 | 2192 → 2058 |
| crowd | mid | playing | 30 → 56 | 44.9 → 25.3 | 59.8 → 25.4 | 14.51 → 4.28 | 72.4 → 9.0 | 89 → 88 | 2084 → 2044 |
| crowd | close | paused | 0 → 0 | 1.4 → 0.1 | 1.5 → 0.1 | - | 0.0 → 0.0 | 87 → 88 | 2543 → 2418 |
| crowd | close | playing | 30 → 60 | 51.2 → 25.5 | 66.7 → 25.6 | 16.33 → 4.05 | 63.9 → 7.4 | 89 → 88 | 2445 → 2182 |

main busy % is wall time in main-thread tasks; main CPU % is thread CPU time; JS ms/frame is script time per
frame drawn; GPU proc % is the GPU process main thread busy in a Chrome trace.

## Memory (Chrome memory dump, playing, mid zoom, MB)

| build | world | GPU process | renderer process |
|---|---|---|---|
| old canvas | standard | 166 | 302 |
| cubeforge before the optimisations (main at #279) | standard | 220 | 340 |
| cubeforge after | standard | 150 | 263 |
| old canvas | crowd | 167 | 550 |
| cubeforge before | crowd | 219 | 549 |
| cubeforge after | crowd | 171 | 478 |

## Reading it

- Frames delivered: the old map was capped at 30 drawn frames a second, the new one draws 56-60.
- Main-thread CPU at that higher frame rate is lower than the old map's in every playing scenario: standard
  32.5 → 24.3 % zoomed out, 29.7 → 17.8 % mid, 20.0 → 15.5 % close; crowd 59 → 17 %, 60 → 25 %, 67 → 26 %.
  JS per frame is 2-4x lower (crowd mid 14.5 → 4.3 ms), GPU process time 5-9x lower.
- A paused world is 0.0-0.1 % busy (the old map idled at 1.0-1.4 %).
- Heap after GC is the same (standard 30 MB, crowd 88 MB). First frame is the same or better.
- Memory: GPU process memory is now below the old canvas map on the standard world (150 vs 166 MB) and about equal on
  the crowd; the cubeforge map before the atlas change used 220 MB.
- Not reached: 3 % main-thread busy at 60 fps with 3,000 people (25 % here). What is left is mostly the engine's
  per-frame sprite packing, see `docs/ENGINE_REQUESTS.md`.
