# World view benchmark

Measures the map the way a player sees it: a production build, in headless Google Chrome with the GPU
(Metal through ANGLE on a Mac), driven over the DevTools protocol. No dependencies beyond Node 22+ and Chrome.

```sh
pnpm build
node bench/run.mjs --builds main=dist --runs 3          # about 40 minutes for everything
node bench/report.mjs bench/results/main                 # markdown tables, medians over the runs
```

Quick look at one scenario while working on something:

```sh
node bench/run.mjs --builds main=dist --fixtures crowd --zooms close --modes playing --runs 1
```

## What it loads

`gen-world.mjs` runs the wasm simulation once (about two minutes, then cached in `bench/.cache`) and writes
two saved worlds the app finds in IndexedDB exactly as a returning player's save:

- `standard`: seed 42 at tick 9000 (172 people, 869 buildings)
- `crowd`: the same world with 3,000 more people spawned around its busiest spot

## What a scenario is

A fresh Chrome (own profile, own GPU process) opens the app on a world, waits for the first frame, puts the
camera at a zoom (`overview` = the whole world, `mid` = zoom 1, `close` = zoom 3), then either lets the
simulation run (`playing`) or pauses it (`paused`), waits 3 s, and measures an 8 s window. The camera is steered
through `window.__thbBench`, which the app publishes when the address has `?bench` (`src/game/render/bench-hooks.ts`).

Three passes per scenario, because tracing slows the page down a little:

| pass | how | gives |
|---|---|---|
| `metrics` | `Performance.getMetrics`, process CPU times, engine stats | main-thread busy % (wall time in tasks), main-thread CPU %, script ms, process CPU of renderer / GPU / browser, long tasks, JS heap after a forced GC, engine texture bytes, draw calls and instances |
| `trace` | Chrome trace of the window | frames delivered (compositor frames drawn), GPU process main-thread busy %, GC count and pauses, long tasks, a breakdown of main-thread time |
| `memory` | Chrome memory dump | GPU process memory (ANGLE/Metal: textures, buffers, surfaces), renderer footprint, canvas backing stores, V8 |

First-frame time is the moment the startup cover comes off, measured from navigation start (local server, so
network time is about zero).

## Visual check of one feature

`capture-feature.mjs` is the tool for "does this feature look right on the map". It takes a seed and a tick,
simulates the world if the cache has no save for it (in this checkout's wasm, so build it first with
`scripts/build-wasm.sh`), finds a tile of the feature in the saved frame, opens the production build in
headless Chrome with the GPU, pauses it, centres the camera on the tile and writes PNGs.

```sh
cd apps/web && pnpm run build && cd -                       # the dist the tool serves
node apps/web/bench/capture-feature.mjs --seed 42 --tick 18000 --list          # what the world holds
node apps/web/bench/capture-feature.mjs --seed 42 --tick 18000 --feature building:market \
  --out apps/web/bench/results/capture --tag mine
node apps/web/bench/capture-feature.mjs --seed 42 --tick 18000 --feature caravan:stone --zooms close,overview
```

- Features: `building:<kind>` (or a bare kind: `market`, `gate`, `watchtower`), `caravan[:<cargo>]` (on the
  road at the tick), `boat`, `ferry` (a ferry at its landing or under way), `field` (a farm plot). `--index N` picks another candidate; candidates are
  ordered by distance to the nearest settlement, so the default is a town's, and the same every run.
- Output: `<out>/<tag>-<feature>-close.png`, `-overview.png` and `-close-crop.png` (the centre at 2x). The last
  stdout line is JSON with the tile and the files. `--zooms` takes `close`, `mid` and `overview`.
- Limits: the browser is killed after `--limit` seconds (default 110) even if the page hangs, and a simulation
  runs in a child process killed after `--gen-limit` seconds (default 900). Nothing opens a window; Chrome is
  headless. Run long captures in the background and read the PNGs with an image viewer after they finish.
- The camera centres on the tile's centre; the top bar and dock cover part of the view, so the feature can sit
  a tile or two off the crop's middle. Check the overview shot for context before judging the placement.
- Saves are cached in `bench/.cache` as `s<seed>-t<tick>.bin/.json/.frame.json` (the frame is the full
  `fullFrame` JSON, kept for the feature search). The first run for a new seed and tick takes minutes.
- `find-feature.test.mjs` tests the feature search: `node --test apps/web/bench/find-feature.test.mjs`.

`gen-save.mjs --seed N --tick T` writes a save on its own.

## Comparing two builds

Pass several builds; scenarios alternate between them so a busy machine hurts both alike:

```sh
node bench/run.mjs --builds old=/path/to/old/dist,main=dist --runs 3
node bench/report.mjs bench/results/old bench/results/main   # tables and a comparison
```

`old-canvas-bench-hook.patch` adds the `?bench` hook to the last canvas-based commit (`45a1ee5a`):
`git worktree add --detach ../old 45a1ee5a && cd ../old && git apply apps/web/bench/old-canvas-bench-hook.patch`
(copy the patch out first, it is not in that commit), install, `pnpm build`.

## Profiling

```sh
pnpm exec vite build --sourcemap --outDir dist-prof
node bench/run.mjs --builds prof=dist-prof --profile --gl-log --fixtures crowd --zooms close --modes playing --passes metrics --runs 1
node bench/profile-summary.mjs bench/results/prof/crowd-close-playing-run1.cpuprofile --dist dist-prof
```

`--profile` writes a CPU profile of the window; `profile-summary.mjs` maps it back to `src/` and
`node_modules/` through the source maps and prints self and inclusive time by file and function.
`--gl-log` adds the live WebGL textures by size and the texture upload sizes to the results.
`--alloc-profile` samples every allocation in the window (what makes garbage) into a `.heapprofile` that
`profile-summary.mjs` reads the same way; `--startup-profile` profiles the page from navigation to the first
frame; `--eval '<js>'` stores the value of an expression evaluated in the page after the window (for example
`JSON.stringify(window.__thbCf.registry.stats())`, the world drivers' own timings and counts);
`profile-summary.mjs <profile> --callers <name>` shows who calls a function and how long it ran under each caller.

Numbers measured with this harness on the previous canvas map and on the xipjs map are in [RESULTS.md](RESULTS.md).

## Reading the numbers

The machine matters: the report prints the load average the runs saw. Compare builds from the same
`run.mjs` invocation, and treat differences under about 10% as noise. `main busy %` is wall time inside
renderer main-thread tasks, so it grows when the CPU is contended; `main CPU %` in `results.json` is less
sensitive. Frames delivered are compositor frames actually drawn, which is what a player sees.
