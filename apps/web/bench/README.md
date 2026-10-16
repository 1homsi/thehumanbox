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

## Mobile touch checks

`mobile.mjs` opens a production build in headless Chrome with touch emulation and checks horizontal overflow
at 360x740, 390x844, 844x390, 768x1024 and 1280x800. On touch sizes it opens the Stats modal and checks its
bounds, then verifies one-finger pan, two-finger pinch and tapping the seeded population at 390x844. It also
reports visible, unclipped touch targets smaller than 44x44, grouped by viewport and page/modal state; pass
`--strict-targets` to make those findings fail the run. The target-size gate is informational by default
because the existing header and dock controls are below 44px; mobile layout changes can turn it on as they
bring those controls up to size. Phone viewports use DPR 3, the tablet uses DPR 2 and desktop uses DPR 1.

The existing mobile shell hides the Stats opener, so this check currently triggers its app action directly to
test modal geometry. It does not verify menu reachability, which is the separate MOB-04 task. The harness
checks browser layout and touch behavior; it does not run a CPU throttle or measure real-device performance.

```sh
pnpm build
node bench/mobile.mjs
node bench/mobile.mjs --shots /tmp/mobile-shots --strict-targets
node bench/mobile.mjs --viewports 390x844
node bench/mobile.mjs --viewports 360x740 --skip-interactions
```

The first run generates and caches the seeded worlds under `bench/.cache`. `--shots` writes one screenshot per
viewport even when a check fails. A custom viewport list must include 390x844 for the interaction checks;
`--skip-interactions` opts out explicitly. Use `--build <dist>` for another production build and `--fixture crowd`
for the 3,204-person world.

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

`--modes panning` is `playing` with the camera moving through four directions over the measured window (not in the
default modes): it sends real `d`, `s`, `a`, `w` key events to the map along a roughly closed square around its
starting camera position. This exercises camera movement for workloads that depend on the visible window. `results.json`
has `panPx`, the world px the camera travelled (0 at `overview`, where the whole world fits and nothing can pan;
use `mid` or `close`). The value confirms camera movement; it does not prove any particular renderer rebuilt.
Because camera movement is capped per rendered frame, comparisons must use the same CPU throttle: slower frame
rates reduce `panPx` and can sample less new ground. The `memory` pass is skipped for panning because it takes an
instantaneous snapshot without a measured window.

```sh
node bench/run.mjs --builds main=dist --fixtures crowd --zooms mid --modes playing,panning --passes metrics --runs 3
```

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
  road at the tick), `boat`, `ferry` (a ferry at its landing or under way), `ship` (a sailing ship or steamship), `field` (a farm plot), `pier` (a harbour's berth or a ferry landing, one per tile). `--index N` picks another candidate; candidates are
  ordered by distance to the nearest settlement, so the default is a town's, and the same every run.
- Output: `<out>/<tag>-<feature>-close.png`, `-overview.png` and `-close-crop.png` (the centre at 2x). The last
  stdout line is JSON with the tile and the files. `--zooms` takes `close`, `mid` and `overview`.
- Readiness: the page is ready when the map has drawn its first frame (the startup cover fades out, `page-init.mjs`),
  not after a fixed wait. Each wait has its own deadline and the log says what it was waiting for; every CDP call
  has a timeout. A failure says which phase it was in.
- Limits: the whole browser part is killed after `--limit` seconds (default 240). Chrome runs in its own process
  group, and it is killed on every exit path (normal end, a failure, the time limit, Ctrl-C, SIGTERM), so no headless
  Chrome is left behind. A simulation runs in a child process killed after `--gen-limit` seconds (default 900); that
  step is silent until it ends, so a first run for a new seed and tick can look stalled for minutes. Nothing opens a
  window; Chrome is headless. Run long captures in the background and read the PNGs after they finish.
- `--mark 1` (the default) draws a thin magenta square at the map's centre in the close shots, where the camera puts
  the target tile, so the tile can be found in the picture. It is added to the page for the capture only.
- The camera centres on the map canvas, which is not the whole window (the top bar and dock take space); the
  crosshair and the close crop follow the canvas centre. Check the overview shot for context before judging the placement.
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

## Toaster and mobile conditions

Three flags make the same scenarios harder, to see how the map holds up on a weak machine or a phone:

| flag | what it does |
|---|---|
| `--cpu-throttle <n>` | slows the page's CPU `n` times (`Emulation.setCPUThrottlingRate`, applied before navigation). 4 is a decent laptop on battery, 6 a mid-range phone |
| `--mobile` | phone preset: 390x844 at DPR 3, touch emulation, mobile user agent (`--size` and `--dpr` still override the viewport) |
| `--gpu-off` | renders with SwiftShader (software WebGL) instead of the GPU; very slow at phone DPR, so combine it with a small `--size` or `--dpr 1` |

A 390 px wide viewport also switches the app to its mobile layout (the banner, welcome modal and toolbar differ), so
`--mobile` measures that UI, not just a smaller canvas.

The conditions are recorded in every `results.json` row. `report.mjs` prints them in the table heading (and in a
`conditions` column when a directory mixes several); comparisons only pair rows measured under the same conditions.
Use one `--out` directory per condition:

```sh
/Users/mhomsi/dev/extra/overnight/bench-lock.sh node bench/run.mjs --builds main=dist --fixtures crowd --zooms mid \
  --modes playing --passes metrics --runs 2 --out bench/results/cpu6 --cpu-throttle 6
node bench/score.mjs bench/results/cpu6       # one line per scenario
```

`score.mjs` prints one line per scenario (fps, main busy %, JS ms/frame, JS heap) for pasting into a PR. With only
the `metrics` pass, fps is the engine's own rendered-frame count; with the `trace` pass it is the frames delivered.

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
