# Overnight performance push: worker brief (read fully before starting)

## Goal
Make The Human Box run on a toaster: cut main-thread / GPU / memory / load cost toward 30x vs today, fix bugs, and make
the UI work on phones. Every change must be real and measured. No filler PRs, no cosmetic churn, no renames for their
own sake. A task that turns out to give no measurable gain ends with "no gain, not opened" - that is a fine result.

## Repos
- App: `/Users/mhomsi/dev/extra/thehumanbox` (GitHub `1homsi/thehumanbox`). Rust sim (`crates/`, `apps/server`),
  React/Vite client (`apps/web`), Electron (`apps/desktop`). Read `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`,
  `apps/web/bench/README.md`, `apps/web/bench/RESULTS.md`, `docs/ENGINE_REQUESTS.md` as needed.
- Engine: `/Users/mhomsi/dev/extra/1homsi/cubeforge/cubeforge` (GitHub `1homsi/xip`, npm `xipjs`, formerly `cubeforge`).
  pnpm monorepo; `packages/renderer` holds the WebGL renderer, `SpriteLayer`, `TileLayer`, `TextLayer`.
  The app may still import `cubeforge` 0.14 until the migration PR to `xipjs` lands; check `apps/web/package.json`.

## Baseline (main 9f2ebb8a, crowd 3,204 people, mid zoom, playing; full table in /Users/mhomsi/dev/extra/overnight/BASELINE.md)
| condition | fps | main busy % | JS ms/frame |
|---|--:|--:|--:|
| default 1280x800 | 60 | 11.3 | 1.65 |
| `--cpu-throttle 6` (THE TOASTER NUMBER) | 54 | 67.7 | 11.30 |
| `--mobile` 390x844 DPR3 | 60 | 10.2 | 1.44 |
| `--mobile --cpu-throttle 6` | 55 | 56.7 | 9.42 |
Primary metric: JS ms/frame and main busy % under `--cpu-throttle 6`; 60 fps there is the toaster goal.

## Fast setup for app benches (saves ~5 min)
- World fixtures: pass `--cache /Users/mhomsi/dev/extra/overnight/bench-cache` to bench/run.mjs (shared, don't delete).
- WASM: if your branch does not change Rust code, copy the prebuilt sim instead of `make wasm`:
  `cp -R /Users/mhomsi/dev/extra/overnight/wasm-sim-core-9f2ebb8a apps/web/src/wasm/sim-core` (gitignored).
- Interleave base and new in one invocation (`--builds base=<dir>,new=dist`) so machine load hits both alike.

## Workflow for one task
1. Work in your own checkout. App tasks: you were started in an isolated worktree, so use it, but FIRST run
   `git fetch origin && git checkout -B <slug> origin/main` (the worktree may start from an older commit). Engine tasks: create one:
   `git -C /Users/mhomsi/dev/extra/1homsi/cubeforge/cubeforge fetch origin && git -C /Users/mhomsi/dev/extra/1homsi/cubeforge/cubeforge worktree add /Users/mhomsi/dev/extra/overnight/wt/<slug> -b <slug> origin/main`
   then `pnpm install --frozen-lockfile` there. Always branch from fresh `origin/main`.
2. Keep the change focused: one idea per PR. Match surrounding code style and comment density.
3. Verify locally:
   - App web: `cd apps/web && pnpm test && pnpm lint && pnpm exec tsc -b` (or `pnpm build`).
   - Rust: `cargo test --release --locked --workspace`, `cargo clippy --workspace --all-targets --locked -- -D warnings`,
     `cargo fmt --all -- --check`; sim perf via `make perf-gate` / `make profile`.
   - Engine: `pnpm run typecheck && pnpm test` (scope with `pnpm vitest run <path>` while iterating), `pnpm run bench:ci`,
     `pnpm run size:check` if you touch exports.
4. Measure perf changes A/B on the same machine, interleaved. The machine is shared by many workers, so ALWAYS wrap
   browser benchmarks in the lock (it serialises Chrome runs machine-wide):
   `/Users/mhomsi/dev/extra/overnight/bench-lock.sh node bench/run.mjs --builds base=<base-dist>,new=dist --fixtures crowd --zooms mid --modes playing --passes metrics --runs 3`
   (build the base from `origin/main` in a scratch worktree; keep scenarios narrow so the lock is held briefly).
   For engine changes, bench through the app: build the engine, point the app worktree at it with
   `pnpm add <path-to-engine>/integrations/xip` (or the cubeforge path if the app is not migrated yet) - do NOT commit that.
   Engine microbenchmarks (`pnpm run bench`) are fine as extra evidence.
5. Commit with a plain descriptive message in the repo's style (see `git log`), ending with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Push and open a PR against `main` with `gh pr create`. Title in the repo's current style: `perf: <plain sentence>
   (<measured win>)`, `fix: ...`, `mobile: ...`, e.g. "perf: haze paints only the banks the camera can reach
   (standard haze+stars -86%, crowd -74%)". Engine repo: same idea, see its `git log`.
   Body: what and why, measured before/after numbers with the exact command, risks. End the body with:
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
6. Register the PR with the orchestrator thread: call the t3-code tool `link_pull_request` with the PR url and
   `threadId: "dcd6cabf-27eb-4be1-b40a-7eab8138a6ae"` (skip silently if the tool is unavailable; report the URL anyway).
7. Review: get a fresh-context review of the PR diff (correctness bugs, regressions, do the numbers support the claim).
   Use the t3-code tool `delegate_task` with target {providerInstanceId:"codex", model:"gpt-6-luna",
   options:{reasoningEffort:"high"}}, mode "wait", role "review" (not Claude: the user is saving Claude usage), and a task that
   gives the PR URL and asks for findings only (no edits). Fix real findings, push again. If no subagent tool works,
   do NOT merge: finish with `RESULT: open` and the orchestrator will review and merge it.
8. Wait for CI: `gh pr checks <n> --watch --interval 30`. If red, fix. If `main` moved and the PR conflicts, rebase onto
   `origin/main`, re-run tests, force-push.
9. Merge when CI is green and review is clean: `gh pr merge <n> --squash --admin --delete-branch`.
   (The user authorised admin merges for this run. App merges deploy to production, so never merge anything red,
   half-done, or unverified.) Engine (xip) PRs: merge too; the orchestrator batches the npm releases - do NOT create
   GitHub releases or bump versions yourself.
10. Clean up your engine worktree (`git worktree remove`).

## Your final reply (keep it to at most 6 lines)
`RESULT: merged|open|no-gain|blocked` / PR URL / one line: what changed / one line: measured numbers /
one line: follow-up ideas you noticed (concrete, file-level) / anything the orchestrator must do.

## Rules
- Never weaken tests, budgets or lint to get green. Never disable a check. No `--no-verify`.
- Don't touch unrelated files; don't reformat.
- If usage limits or provider errors stop you, say so in the reply.
- Don't push to `main` directly, don't create releases, don't change repo settings.
- Don't end your turn while a benchmark, build or CI run is still going: wait on it in the foreground (long timeouts,
  `gh pr checks --watch`), then continue. Ending the turn early can leave the task stranded. Make sure the bench
  harness in your app worktree is current (`git checkout origin/main -- apps/web/bench`) so flags like
  `--cpu-throttle` are not silently ignored.
- HEAVY WORK GOES THROUGH THE LOCK (the laptop crashed when 5 Rust builds ran at once). Wrap EVERY heavy command:
  `/Users/mhomsi/dev/extra/overnight/heavy-lock.sh rust <cmd>` for cargo build/test/clippy, wasm-pack, `make wasm`,
  `make perf-gate`, `make profile` (one at a time machine-wide; it sets CARGO_BUILD_JOBS=6 and the shared
  CARGO_TARGET_DIR), and `/Users/mhomsi/dev/extra/overnight/heavy-lock.sh js <cmd>` for `pnpm build`, vite builds,
  `pnpm test`/vitest full runs, `tsc -b`, engine `pnpm run typecheck`/`pnpm test`/`bench` (two at a time).
  Browser benches still use bench-lock.sh. Small scoped commands (one vitest file, git, gh) need no lock.
  Never run cargo without the lock. Vitest: always pass `--maxWorkers=2` (it otherwise starts 11 threads even for one file);
  eslint on changed files only (`pnpm exec eslint <files>`), not the whole tree. The user also works on this laptop: leave room. Kill any Chrome you started if you abort a run.

## Engine A/B through the app (added 21:45)
When you link a local xip build into an app worktree, add `resolve: { dedupe: ['react', 'react-dom'] }` to `apps/web/vite.config.ts` in that worktree (do not commit it). Without it the app loads two copies of React and silently falls back to Canvas2D, which makes every GPU number meaningless.
