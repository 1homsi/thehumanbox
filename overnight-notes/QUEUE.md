# Pending queues (orchestrator launches from the top as slots free)
Limits: at most 5 workers at once (the user's own builds share this laptop); at most 2 Rust-heavy queues (marked RUST) at once; do not launch when the
1-minute load average is above 24 or `memory_pressure | tail -1` free % is below 30 (swap usage is sticky on macOS, ignore it) (`uptime`). All workers: codex, model gpt-6-luna (options {reasoningEffort:"high"}), isolation worktree. USER 23:40: use OpenCode Go and save Claude; Go is limit-exceeded as of 09:09, so Luna until Go works again. Never Claude.
prompt = "Read BRIEF.md, RESUME.md and HAIKU.md fully, then follow them. Queue name: <name>. <items>. The previous
worker on this queue was cancelled; check RESULTS-haiku.md, open PRs and its worktree first."
Move a line to LEDGER.md when launched.

Running (09:15): webq-wire-lx1, h-web-overlay-lx1, h-eng-ctx-lx1 (+eng terrain), h-sim-tick-a-lx1 (RUST), mobq-1-lx1  [all codex gpt-6-luna]

0. app-xip-0154: bump xipjs to 0.15.4 in apps/web (and any other package depending on it); correctness fixes only (release notes https://github.com/1homsi/xip/releases/tag/v0.15.4), no perf claim needed; full checks + CI, merge.
1. h-xb-a: xip #104 (XB-03 TriMesh BVH) review/merge, then XB-04 (backlog/bugs-engine-2.md). #103 XB-11 stays open (size gate).
2. h-web-terrain: WEB-02, WEB-04, WEB-28, WEB-13 (WEB-03 #705 and WEB-21 #708 merged)
3. h-sim-tick-b (RUST): take over #674 (SIM-09 gate), then SIM-21, 22, 24, 23, 08, 25
4. simq-wasm+srv (RUST): rest of SIM-11 (autosave size) + apps/server broadcaster.rs ~38-58 idle encode-failure loop (rebuilds a full frame every cycle, unthrottled log); fix + test
5. ui-followups: App.tsx ~439/~554 '[' ']' 'H' selectors lack dialog; FamilyTreeModal.tsx ~458 ResizeObserver portal timing; welcome card Escape doesn't restore focus / one Escape closes two overlays; phone-menu opener unmount drops focus. One PR each with failing-first test.
6. h-load-b: WEB2-06, 08, 04 (backlog/web-2.md)
7. scouts (light, no builds): h-scout-server (bugs-server-2.md); check h-scout-render output (render-2.md) and queue impl

Needs a USER decision (do not launch): WebP sprite sheets (+-1 compositing diff), drop 3.9 MB look-atlas (memory vs first room-open hitch), xipjs size budget 37,000 B (#90, #103 exceed by 5-145 B), SIM-20 design, DSK-16 CSP approach (#698), xip #84 depth buffer (pending h-eng-ctx A/B).
