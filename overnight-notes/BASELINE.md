# Baseline for the overnight run (thehumanbox main 9f2ebb8a)

Table also in apps/web/bench/RESULTS.md on the PR branch. Command per condition: `bench-lock.sh node bench/run.mjs --builds main=dist --fixtures crowd,standard --zooms mid --modes playing --passes metrics --runs 2 --out bench/results/<name> [--cpu-throttle 6] [--mobile]`; score with `node bench/score.mjs`.


Main at `9f2ebb8a` (xipjs 0.15), mid zoom, playing, metrics pass, 2 runs, Chrome 155 with the GPU, 8 s windows after a
3 s warm-up. The worlds are regenerated on this build (crowd = 3,204 people, standard = 204), so they are a little
larger than in the tables above. fps is the engine's own rendered-frame count (no trace pass). Each condition was a
separate run, one after the other; the 1-minute load average was 10-39 while they ran, so compare conditions loosely
and judge a change by an interleaved A/B against its own base.

| condition | world | fps | main busy % (min-max) | main CPU % | JS ms/frame | JS heap after GC MB | load avg |
|---|---|--:|--:|--:|--:|--:|--:|
| default (1280x800, DPR 1) | standard | 60 | 10.5 (8.9-12.1) | 10.7 | 1.54 | 35 | 10 |
| default (1280x800, DPR 1) | crowd | 60 | 11.3 (11.1-11.5) | 11.5 | 1.65 | 96 | 10 |
| `--cpu-throttle 6` (1280x800, DPR 1) | standard | 58 | 47.9 (47.5-48.4) | 92.1 | 7.28 | 35 | 14 |
| `--cpu-throttle 6` (1280x800, DPR 1) | crowd | 54 | 67.7 (65.2-70.1) | 95.1 | 11.30 | 94 | 13 |
| `--mobile` (390x844, DPR 3, touch) | standard | 60 | 7.9 (7.6-8.3) | 8.1 | 1.12 | 34 | 24 |
| `--mobile` (390x844, DPR 3, touch) | crowd | 60 | 10.2 (9.8-10.5) | 10.2 | 1.44 | 93 | 15 |
| `--mobile --cpu-throttle 6` | standard | 58 | 43.4 (43.2-43.5) | 91.5 | 6.53 | 35 | 36 |
| `--mobile --cpu-throttle 6` | crowd | 55 | 56.7 (56.0-57.5) | 93.5 | 9.42 | 95 | 38 |

Reproduce, one `--out` per condition (under `bench-lock.sh` when the machine is shared):
`node bench/run.mjs --builds main=dist --fixtures crowd,standard --zooms mid --modes playing --passes metrics --runs 2 --out bench/results/<name> [--cpu-throttle 6] [--mobile]`,
then `node bench/score.mjs bench/results/<name>/main`.

- Under 6x CPU throttle the crowd is busy 57-68 % of the time in main-thread tasks (the throttle also stretches
  tasks, so main CPU % sits at 92-95 % in every throttled row) and the frame rate slips to 54-55 fps. That is the
  toaster number to beat.
- `--mobile` runs the app's mobile layout (390 px wide), and its crowd is 10.2 % busy against 11.3 % on the desktop
  viewport; at DPR 3 it still holds 60 fps. The difference is within what the load swings explain, so the phone's
  problem here is CPU speed, which `--mobile --cpu-throttle 6` models.
