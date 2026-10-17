# Overnight run ledger (orchestrator state)

Started 2026-10-16 ~00:40. Orchestrator thread dcd6cabf-27eb-4be1-b40a-7eab8138a6ae.
Policy: workers merge green+reviewed PRs with --admin (user authorised; main protection needs 1 review).
Engine (xip) PRs merge to xip main; orchestrator batches GitHub releases (publish.yml -> npm xipjs) then a worker bumps the app.
Workers: codex gpt-6-luna + opencode deepseek-v4.1-flash-free (user preference). Reserve: claudeAgent claude-sonnet-5-5. NEVER claude_alt for workers. Haiku only for dull scouting.
Concurrency cap: ~8 implementation workers (machine load avg 9-15, 12 cores). Browser benches serialised via bench-lock.sh.

## Phase 0 (launched)
- p0-xipjs-migration (impl)    - app cubeforge 0.14 -> xipjs 0.15
- p0-toaster-bench (impl)      - --cpu-throttle / --mobile bench + baseline
- p0-scout-engine/web/sim/mobile/bugs (research) -> backlog/*.md

## Dispatched tasks (id -> status / PR)
- bugq-sim [luna] BUG-01,02,03,05,04 - running
- bugq-net [luna] BUG-20,23,21,24,22,25,28 - running
- bugq-map [luna] BUG-31,32,33,34,39,36,37,35,40,26,29 - running
- bugq-engine-loop [luna] BUG-44,45,43,50,52,51,46,47,48,49,68 - running
- mobq-1 [luna] MOB-01..23 + BUG-38,42 - running
- mobq-2 [luna] MOB-38,36,34,35,33,37,24..32 - running
- bugq-desktop [luna] BUG-06,12,08,10,11,14,19,17,18,13,15,16,07,09,30 - running
- webq-wire [luna] WEB-01,05,09,06,07,29,23 - running
- webq-terrain [luna] WEB-02,03,04,21,28,13 - running
- webq-overlay [luna] WEB-24,25,11,12,19,15,18,14,31,30 - running
- eng-sortbykey-incremental [luna] ENGINE_REQUESTS ranked 1+3 (sortByKey incremental repack + drawOrder) - running

## Engine releases

## Notes
- p0-xipjs-migration: NO-OP, already done on main (#499). Local main was 409 commits stale; fast-forwarded to 9f2ebb8a (0.5.74).
- p0-scout-bugs DONE: backlog/bugs.md 68 bugs. Not yet queued: desktop BUG-06..19,30; engine input BUG-53..60; audio/net BUG-61..65; spritelayer BUG-66,67 (after sortbykey); UI BUG-27,41; touch BUG-38,42 -> mobile queue.
- p0-scout-mobile DONE: backlog/mobile.md 38 items. Toaster datum: crowd 390x844 DPR3 6x throttle = 56.6 fps, 45% busy (unthrottled 8.2%).
- p0-toaster-bench MERGED #590 (bench --cpu-throttle/--mobile/--gpu-off, score.mjs). Shared cache: overnight/bench-cache, wasm-sim-core-9f2ebb8a.
- p0-scout-web DONE: backlog/web.md 31 items. Not yet queued: people/merge WEB-08,16,17,20,27; startup WEB-26,22; WEB-10 (DPR cap, needs xipjs prop; overlaps MOB-33 in mobq-2).

## Codex limit hit (~02:00), resets 05:08. Failed luna queues re-dispatched to claude_alt sonnet as *-r1:
- bugq-sim-r1 (takes over PR 593), bugq-net-r1 (BUG-20 done #591), bugq-desktop-r1 (BUG-06 done #594, takes over PR 599), webq-wire-r1, webq-overlay-r1 (takes over PR 597)
- Still on luna (expect failure; resume on sonnet when they fail): eng-sortbykey, bugq-map (merged #592; open #598), bugq-engine-loop (xip #57,#58 merged; open xip #59), mobq-1 (merged #596), mobq-2 (open #595), webq-terrain
- Merged so far: app #590 #591 #592 #594 #596; xip #57 #58
- eng-sortbykey FAILED (codex limit) -> eng-sortbykey-r1 [sonnet] resumes engine wt incremental-sprite-layer-sort (2 local commits)
- mobq-1, mobq-2 FAILED (codex) -> mobq-1-r1 (from MOB-02), mobq-2-r1 (takes over PR 595) [sonnet]
- bugq-map, bugq-engine-loop FAILED (codex) -> bugq-map-r1 (takes PR 598, +BUG-27,41), bugq-engine-loop-r1 (takes xip#59, +input BUG-53..60) [sonnet]. Only webq-terrain still on luna.
- webq-terrain FAILED (codex) -> webq-terrain-r1 [sonnet] continues WIP in t3-d92e4ed1. All luna queues now moved. Codex resets 05:08.
- 02:12 load avg 120: killed 3 orphaned bench Chromes (ppid 1); bench-lock.sh now auto-kills them; brief: nice + CARGO_BUILD_JOBS=4 + shared CARGO_TARGET_DIR. Go/Swift builds from other work also on the machine.
- p0-scout-sim DONE: backlog/sim.md 25 items. Launched simq-server (SIM-01,20,17,19,18) and simq-tick (SIM-09,02,07,06,03,04,05,10,16,08,21,22,24) [sonnet]. Not queued: wasm SIM-11..15 (+WEB-22 autosave) - launch when load drops / codex back 05:08.
- bugq-map-r1 DONE: 12 merged (#598 #608 #609 #610 #612 #614 #615 #616 #619 #621 #623 #624). Follow-ups: BUG-33 GPU failure after interior mounted -> blank room; BUG-35 '?' when sandbox disabled.
- webq-people [sonnet] WEB-08,16,17,20,27 + BUG-39 2nd half - running

## 08:31 status
- ALL claude_alt sonnet workers FAILED on "Claude API rate limit" (bugq-sim/net/desktop/engine-loop/map? -r1, webq-wire/overlay/terrain-r1, mobq-1/2-r1, simq-server, simq-tick, webq-people). eng-sortbykey-r1 ended mid A/B.
- p0-scout-engine DONE: backlog/engine.md ENG-01..26 (ENG-01 strips GPU -23..-50%, ENG-02 maxDpr -50% GPU DPR3, ENG-03 radix sort, ENG-04 text cache, ENG-05/06 terrain).
- Merged by 08:31: app ~41 PRs (#590-#634), xip #57-#70; main at 0.5.79. Open: app #637 #636 #635 #633 #630 #629 #625 #618 #613; xip #71 #72.
- Relaunched on codex gpt-6-luna (prefix ...%3Amcp%3A863f6424-d40c-458f-a1d0-bc27d3624ec8%3Adelegate-task%3A<id>), with RESUME.md:
  eng-sortbykey-r2, eng-gpu-1, bugq-engine-loop-r2 (xip#71,#72), bugq-app-r2 (#637 #630 #625 #618 + sim/net + BUG-33/35),
  bugq-desktop-r2 (#636 #635), mobq-2-r2 (#633 #629, MOB-33 maxDpr), mobq-1-r2, webq-terrain-r2, webq-wire-r2 (+xipjs 0.15.1 bump, WEB-26),
  webq-overlay-r2 (#613), webq-people-r2, simq-tick-r2.
- Not yet relaunched: simq-server (SIM-01,20,17,19,18), wasm SIM-11..15 + WEB-22. Pending user: create-xip-game npm trusted publisher.
- 08:40 rebalanced so one limit can't stop everything: cancelled webq-people-r2, mobq-1-r2, bugq-desktop-r2 (luna) ->
  webq-people-r3 + mobq-1-r3 [claudeAgent sonnet], bugq-desktop-r3 [opencode deepseek-v4.1-flash-free]. Luna now 9 workers.
  Heartbeat scheduled every 20 min (overnight-heartbeat-1) to relaunch failed workers on another provider.
- 08:45 USER: prefer Luna + DeepSeek; claudeAgent (non-alt) Sonnet only as reserve; never claude_alt for workers.
  webq-people-r3, mobq-1-r3 (claudeAgent) cancelled -> webq-people-r4, mobq-1-r4 [opencode deepseek]. Now: 9 luna, 3 deepseek, 0 claude.
- bugq-desktop-r3 [deepseek] DONE: merged #636 (BUG-30), #635 (BUG-09), #638 (BUG-13); all other desktop bugs + BUG-27/41 were already merged.
  Launched simq-server-r2 + bugq-desktop-followups (settings-modal unhandled rejections; restart/exit dialog stacking) [deepseek]. Now: 9 luna, 4 deepseek.
- USER: "take a break when done". Plan: let the 13 running queues finish (relaunch only on limit failures), do not start new queues.
  When all are terminal: xip release + app bump if engine PRs merged, final toaster bench vs BASELINE, link PRs, disable heartbeat, final summary.
- USER: 'i said take a break'. All workers cancelled, heartbeat disabled. Run paused. Open app PRs left as-is (#637 #630 #618 #640-#643).

## Resumed 20:30 (USER: "continue with thehumanbox")
- xip v0.15.2 released; create-xip-game trusted publisher validated (0.15.2 published). App main at 0.5.82.
- Task id prefix: node:delegated-task:command%3Amcp%3Ab03523e9-6656-4e5d-a58e-d88287d86d5e%3Adelegate-task%3A<id>
- Luna (codex gpt-6-luna): eng-gpu-3, eng-sortbykey-r4, bugq-app-r4 (#637 #630 #618), webq-wire-r4, webq-people-r5, simq-wasm-1 (WEB-22, SIM-11..15, new)
- DeepSeek (opencode deepseek-v4.1-flash-free): simq-server-r3, mobq-1-r5 (#641), mobq-2-r4 (#640), bugq-desktop-followups-r2 (#642 #643)
- Heartbeat: overnight-heartbeat-2 every 20 min (scheduled-task:command:mcp:b03523e9-6656-4e5d-a58e-d88287d86d5e:schedule-task:overnight-heartbeat-2)
- Not queued: dependabot #600 #588 #587; final toaster bench vs BASELINE when queues finish.
- 20:35 all 4 deepseek-free workers failed instantly ("Rate limit exceeded"). Relaunched on opencode-go/deepseek-v4.1-flash (paid tier, variant high): simq-server-r4, mobq-1-r6, mobq-2-r5, bugq-desktop-followups-r3. Fallback order now: luna <-> opencode-go/deepseek-v4.1-flash; deepseek free is rate-limited.
- webq-people-r5 [luna] stopped after audit only (no PR; BUG-39 first half = #610). Relaunched webq-people-r6 [luna] with "start each item from origin/main, do not stop after planning".
- eng-gpu-3 [luna]: ENG-01 open xip #74 (CI green; review wants pixel diff + vertex-order asserts + GPU A/B). Stopped early. Relaunched eng-gpu-4 [luna] to verify/merge #74 then ENG-03, ENG-04.
- Heartbeat ~21:05: all 10 running. Since resume merged #637 #643 #644; open #645 #646 #641 #640, xip #74 #75 (maxDpr) #76 (sortByKey repack).
- bugq-desktop-followups-r3 [deepseek-go] DONE: #643 merged (single error-dialog slot, 5 review rounds), #642 was already merged. Minor follow-ups (not queued): shared RESTART_OPERATION constant in apps/desktop/main/ipc.ts:220; isStillRelevant() predicates in index.ts untested.
- Heartbeat ~21:25: 9 running, no failures. Merged #652 #654; open #647 #648 #653 #655 #645 #646 #641 #640. xip #75 maxDpr MERGED -> PENDING xip release (holding briefly for #74/#76/#77 to land so one release carries them; cut by ~22:30 regardless), then app bump + MOB-33 app side.
- ~21:40 CODEX LIMIT again (resets Oct 17 01:25). bugq-app-r4 failed -> bugq-app-r5 [deepseek-go]. Expect other luna workers (eng-sortbykey-r4, webq-wire-r4, simq-wasm-1, webq-people-r6, eng-gpu-4) to fail; move each to deepseek-go as it does.
- webq-people-r6 failed (codex limit) -> webq-people-r7 [deepseek-go] (take over #645 if it's from this queue).
- eng-gpu-4 failed (codex limit) -> eng-gpu-5 [deepseek-go] (verify/merge xip #74, then ENG-03, ENG-04).
- All luna workers failed (codex limit until 01:25). Relaunched: simq-wasm-2 + webq-wire-r5 [deepseek-go]; eng-sortbykey-r5 [claudeAgent sonnet — reserve, used so not all 9 are on one provider] (takes over xip #76 #77, then ENG-24).
- Now: deepseek-go x8 (simq-server-r4, mobq-1-r6, mobq-2-r5, bugq-app-r5, webq-people-r7, eng-gpu-5, simq-wasm-2, webq-wire-r5), claudeAgent x1 (eng-sortbykey-r5). Luna back after 01:25.
- mobq-2-r5 [deepseek-go] DONE: merged #640 MOB-36, #650 MOB-34, #651 MOB-35, #652 MOB-26, #654 MOB-37, xip#75 MOB-33 maxDpr (needs xip release + app <Game maxDpr={2}> in WorldView.tsx). MOB-38 already via #595. Not opened: MOB-27 (needs MOB-22), MOB-29/31 (need MOB-04), MOB-28/30/32 (need real device). Follow-ups: #652 nits, maskable icon, LOW_PERF live matchMedia.
- bugq-app-r5 [deepseek-go] DONE: merged #653 BUG-25, #657 BUG-28, #659 BUG-33 follow-up, #660 BUG-35; all other sim/net bugs + #630 #618 already merged. Launched bugq-app-followups-1 [deepseek-go]: wasmWorker lock drop mid reset/restore; CfRoomView startup watchdog.
- eng-sortbykey-r5 [claudeAgent] DONE: xip #76 ENG-08 and #77 ENG-09 neutral in app A/B (11.07 main vs 11.35/11.39 @6x) + stale-order API caveat -> CLOSED no-gain. ENG-24 no-gain (patch at overnight/eng24-gather-blind-wip.patch). Bench tip: linking a local xip build into the app needs resolve.dedupe ['react','react-dom'] in apps/web/vite.config.ts, else 2 Reacts -> Canvas2D fallback (added to BRIEF).

## 21:55 USER: "use as many haiku agents as you want from claude_alt, burn the weekly limit, keep track"
- Added /Users/mhomsi/dev/extra/overnight/HAIKU.md (check already-done first, small PRs, Sonnet claude_alt review, log to RESULTS-haiku.md).
- Haiku impl [claude_alt haiku-5-5 high]: h-eng-terrain-1 (ENG-05,06,07), h-eng-buffers-1 (ENG-17,13,10,21,22), h-eng-ctx-1 (ENG-16,18,14,26,25,15,20), h-eng-text-1 (ENG-12,19), h-eng-bugs-a-1 (BUG-50..56,60), h-eng-bugs-b-1 (BUG-61..68), h-web-terrain-1 (WEB-02,03,04,21,28,13), h-web-overlay-1 (WEB-11,12,14,15,18,19,24,25,30,31), h-sim-tick-a-1 (SIM-02..07,10,16), h-sim-tick-b-1 (SIM-09,21,22,24,23,08,25)
- Haiku scouts (research, write backlog/*-2.md): h-scout-server-1 (bugs-server-2), h-scout-webui-1 (bugs-webui-2), h-scout-desktop-1 (bugs-desktop-2), h-scout-engine-1 (bugs-engine-2), h-scout-perf-load-1 (web-2)
- When scouts finish: launch Haiku impl queues over their findings.
- Still running (non-haiku): deepseek-go: simq-server-r4, mobq-1-r6, webq-people-r7, eng-gpu-5, simq-wasm-2, webq-wire-r5, bugq-app-followups-1.
- Risk: orchestrator + heartbeat also run on claude_alt; if claude_alt hits its limit the orchestration stops until reset.
- xip release: cut ~22:30 with whatever engine PRs merged (maxDpr #75 at least), then app bump + <Game maxDpr={2}>; repeat release every ~2h as engine PRs land.
- h-eng-text-1 DONE: ENG-12 already-done (xip #60); ENG-19 blocked (design decision: eager reset vs recycle stale-density rows; hitch unmeasured). Replaced by h-app-small-1 [haiku] (desktop RESTART_OPERATION const + isStillRelevant tests, LOW_PERF live matchMedia, #652 nits).
- h-scout-desktop-1 DONE: 17 findings in backlog/bugs-desktop-2.md (DSK-01..17). Launched h-desktop-a-1 (DSK-03,04,06,07,17,16,13,01,14) and h-desktop-b-1 (DSK-02,08,09,10,11,15,12,05) [haiku].
- h-scout-engine-1 DONE: 15 findings backlog/bugs-engine-2.md (XB-01..15). Launched h-xb-a-1 (XB-01,02,10,11,03,04) and h-xb-b-1 (XB-05,13,15,08,09,14,12,06,07) [haiku].
- h-scout-webui-1 DONE: 7 findings backlog/bugs-webui-2.md (UI-01..07; UI-02 family tree pan/zoom dead). Launched h-ui-a-1 [haiku]. Haiku running: 17.
- h-eng-buffers-1 DONE: xip #82 merged (ENG-17 lazy batch buffers, -0.9 MB JS + GPU). ENG-13/10/21/22 not opened (below noise / no callers / needs #74 / needs Mali phone). Follow-up: CfRoomView people drivers -> touchRange would make ENG-10 pay.
- h-scout-perf-load-1 DONE: 9 findings backlog/web-2.md (WEB2-01..09; 400 KB SVG -> 7.9 KB PNG, WebP sheets, cards 160 renders/s, wasm compression). Launched h-load-a-1 (WEB2-03,01,02,07,05,09) + h-load-b-1 (WEB2-06,08,04) [haiku].
- Heartbeat 22:07: free models still rate-limited. Merged #662 (world lock kept through reset/restore) #663; open #665-#669. h-eng-bugs-a: BUG-50..55 already-done (xip #61 #65 #67-#70). xip #84 (no depth buffer) left open by Haiku: memory-only, needs orchestrator decision. xip release planned 22:30.
- h-app-small-1 DONE: merged #663 (shared restart constant + prompt-relevance.ts tests), #665 (#652 nits); LOW_PERF live flip no-gain (needs reload anyway). Haiku running: 17.
- bugq-app-followups-1 [deepseek-go] DONE: merged #662 (lock held through reset/restore + 4 bail tests), #668 (CfRoomView startup watchdog). Follow-up -> h-app-lock-1 [haiku]: prepare_reload during unreadable-save preserve write. DeepSeek-go now 6 running.
- ~22:20 T3 app restart: most workers auto-resumed (status running, hasPendingChildRuns). Left cancelled: simq-server-r4, mobq-1-r6, webq-people-r7, simq-wasm-2 (deepseek-go) and h-web-terrain-1. Relaunched all 5 on claude_alt Haiku (new task id prefix node:delegated-task:command%3Amcp%3A96da2123-6d3c-4063-b53f-0fdf0b4660e6%3Adelegate-task%3A<id>): simq-server-h1, mobq-1-h1, webq-people-h1 (finish #666 first), simq-wasm-h1 (talc next; lol_alloc rejected), h-web-terrain-2.
- h-web-overlay-1 still alive (waiting on wasm build). Paid deepseek-go now only: eng-gpu-5, webq-wire-r5.

## 22:40 LAPTOP CRASHED (5 parallel Rust builds, load 130+). All workers cancelled.
- USER: agents are fine, parallel heavy builds are not. Added overnight/heavy-lock.sh (rust: 1 slot, CARGO_BUILD_JOBS=6; js: 2 slots; nice) and made it mandatory in BRIEF.md. Pending queues in overnight/QUEUE.md.
- Caps: <=8 workers, <=2 Rust-heavy queues, no launch when 1-min load > 24.
- Launched 22:40 [claude_alt haiku], task prefix node:delegated-task:command%3Amcp%3Ae8dc859e-a2eb-432c-99f6-7ef218d4b0a8%3Adelegate-task%3A<id>:
  simq-server-h2, webq-people-h2, eng-gpu-h1, h-ui-a-2, h-desktop-a-2, h-desktop-b-2, h-xb-b-2, h-load-a-2
- 22:58 load 130 / swap 6.5 of 7 GB (user's own bh-security vitest, bh-shell tsc, go builds also running). Cut to 5 workers: cancelled h-desktop-a-2, h-desktop-b-2, h-xb-b-2 -> top of QUEUE.md. BRIEF: vitest --maxWorkers=2, eslint changed files only. Cap now 5 workers; skip launches if swap > 5 GB.
- Heartbeat 23:17: load 54, swap 5.2 GB -> no launches. xip #74 (strips) and #93 (radix sort) merged; CI running on main -> release v0.15.3 next tick when green.
- eng-gpu-h1 DONE: xip #74 merged (GPU crowd 2.63->2.03 ms -23%, overview 3.54->2.47 -30%, 0 px diff), #93 merged (radix 25k keys 7.7->0.63 ms), ENG-04 no-gain (patch overnight/eng04-text-layout-cache-wip.patch). Follow-ups: radixSort skip constant byte passes; textLayer insertion sort O(n^2) on big shuffles.
- 23:25 xip v0.15.3 RELEASED (xipjs + create-xip-game 0.15.3 published): #75 maxDpr, #74 strips, #93 radix, #82, #81 #87 #80 #78 #88 #85 #91. Queued app-xip-0153 at top of QUEUE.md. Load 87 / swap 5.4 GB -> not launching yet.
- h-load-a-2 DONE: merged #687 (people sheet SVG 399 KB -> 7.9 KB PNG, decode 23.9->5.0 ms, 0 px diff), #689 (preload sheets: response end ~1.7 s -> ~40 ms), #685 (unused fox.glb removed). WEB2-03 no-gain (cost is layout/paint, not JS). BLOCKED for user: WEB2-02 WebP (+-1 compositing diff), WEB2-05 drop 3.9 MB look-atlas (memory vs first room-open hitch).
- 23:40 USER: going too fast with Claude -> use OpenCode Go. New workers: opencode-go/deepseek-v4.1-flash; reviews: opencode-go/deepseek-v4-pro. Heartbeat slowed to 40 min. Running Haiku workers (simq-server-h2, webq-people-h2, h-ui-a-2) left to finish.
- h-ui-a-2 DONE: all 7 merged: #679 UI-02 family tree pan/zoom, #671 UI-01 modal focus, #686 UI-07 welcome trap+Esc, #688 UI-04, #690 UI-03, #692 UI-05, #693 UI-06. Follow-ups queued as ui-followups.
- simq-server-h2 DONE: merged #656 SIM-01 (delta -18%, egress -15%), #661 SIM-17, #691 SIM-19 (worst lock wait 143-167 -> 4-5 ms), #694 SIM-18. SIM-20 blocked (design call: per-organism revision vs longer full-frame interval). Follow-up queued: broadcaster.rs idle encode-failure loop.
- 00:12 launched on opencode-go (task prefix ...e8dc859e...): app-xip-0153-1 (bump xipjs 0.15.3 + maxDpr=2), h-desktop-a-og1. Gate changed: memory_pressure free% < 30 instead of swap (swap is sticky).
- webq-people-h2 DONE: #666/#645/#649 already merged; merged #682 BUG-39 second half (camera follows drawn position). WEB-17/WEB-27 no-gain (patch overnight/wt/web17-healthcolor.patch). All Claude Haiku workers now finished.
- h-desktop-a-og1 DONE: merged #695 DSK-01 (windowsHide:true), #683 DSK-17 (token redacted from boot/stderr/renderer loads), #696 DSK-14 (devBinaryPath repo-root target), #697 DSK-13 (desktop sim skips .env). DSK-03/04/06/07 already merged (#669/#672/#676/#680). #698 DSK-16 left open (webRequest.onHeadersReceived doesn't fire on file://; needs meta CSP injection at copy:renderer or app:// protocol; plus migrateDataRoot path check).
- 01:12 launched on opencode-go (task prefix ...f472242e...): h-desktop-b-og1, h-xb-b-og1, h-xb-a-og1, h-eng-bugs-b-og1 (5 workers running total).
- 01:18 opencode-go hit "Go usage limit exceeded" (and opencode/deepseek-v4.1-flash-free rate-limited; codex/gpt-6-luna resets 01:25). Before hitting the limit, workers merged #699 (xipjs 0.15.3 bump, -20% GPU) and opened #700 (maxDpr=2, -52% mobile GPU), #701 (tray/View menu window swap), xip #94, #95, #96, #97.
- 01:21 Relaunched all 5 queues on antigravity/gemini-3.8-flash-high (reviews on antigravity/gemini-4-argon-high): app-xip-0153-2, h-desktop-b-ag1, h-xb-b-ag1, h-xb-a-ag1, h-eng-bugs-b-ag1.
- 01:24 antigravity/gemini-3.8-flash-high hit quota (resets in ~2h17m). Relaunched all 5 queues on working OpenCode models: app-xip-0153-3 & h-desktop-b-oc1 on opencode/gemini-4-argon, h-xb-b-oc1 & h-xb-a-oc1 on opencode/beam-free, h-eng-bugs-b-oc1 on opencode/longcat-2.5-preview-free (reviews on opencode/gemini-4-argon). Codex gpt-6-luna also resets at 01:25.
- 01:30 opencode/gemini-4-argon hit "Insufficient account funds". Codex gpt-6-luna reset at 01:25 AM and is live! Relaunched app-xip-0153-cx1 and h-desktop-b-cx1 on codex/gpt-6-luna, and updated BRIEF.md/HAIKU.md reviews to use codex/gpt-6-luna (or opencode/beam-free).
- h-xb-b-oc1 opened 6 xip PRs (#94 XB-08, #97 XB-09, #98 XB-14, #99 XB-07, #100 XB-06, #101 XB-12; #92 XB-15 also open) and stopped when opencode/gemini-4-argon review failed. Relaunched as h-xb-b-review-merge-1 (beam-free with codex/gpt-6-luna or beam-free reviews) to review + merge all 6+ PRs. Also h-eng-bugs-b-oc1 merged xip #79 (BUG-62).
- app-xip-0153-cx1 DONE: merged #699 (xipjs 0.15.3 bump, crowd GPU -20% at cpu x6) and #700 (maxDpr=2 on world canvas + terrain LOD alignment, mobile GPU 6.73 -> 3.24 ms/frame, -52%).
- 01:34 launched h-app-lock-cx1 (+ h-web-terrain) on codex/gpt-6-luna.
- h-xb-a-oc1 merged xip #95 (XB-02: clear() keeps deterministic mode) and opened #102 (XB-10) and #103 (XB-11). Relaunched as h-xb-a-cx1 on codex/gpt-6-luna to review/merge #102 & #103 and finish XB-03 & XB-04.
- h-desktop-b-cx1 DONE: merged #701 DSK-15 (tray/View menu window swap), #702 DSK-12 (off-main-thread world save validation, event-loop delay 78.3 -> 3.4 ms), #704 DSK-05 (desktop splash while simulation loads). DSK-02/08/09/10/11 already merged (#673/#675/#678/#681/#684).
- Also merged: #703 (h-app-lock: wait for unreadable-save recovery before reload), xip #83 (BUG-64 WebRTC recovery), xip #94 (XB-08), xip #97 (XB-09), xip #98 (XB-14), xip #99 (XB-07), xip #102 (XB-10).
- 01:55 launched simq-wasm-cx1 (RUST) on codex/gpt-6-luna.
- h-xb-b-review-merge-1 DONE: all 9 XB-b items merged on 1homsi/xip (#87 XB-05, #91 XB-13, #92 XB-15, #94 XB-08, #97 XB-09, #98 XB-14, #99 XB-07, #100 XB-06, #101 XB-12).
- 02:02 launched h-web-overlay-oc1 on opencode/beam-free.
- h-eng-bugs-b-oc1 merged xip #96 (BUG-65: syncEntity full snapshot on reconnect/late-join + per-sender seq restart).
- h-web-overlay-oc1 opened #706 (WEB-11: skip unchanged overlay recordings) then hit opencode/beam-free rate limit; relaunched as h-web-overlay-cx1 on codex/gpt-6-luna.
- h-web-terrain (h-app-lock-cx1) merged #705 WEB-03 (flood-fill lake cells without per-cell arrays, waterPlantsMs 137.6 -> 83.2 ms, -39.5%; busy 51.9 -> 50.2%, JS 7.81 -> 7.49 ms).
- h-eng-bugs-b-oc1 hit longcat-free rate limit after merging xip #79 (BUG-62), #83 (BUG-64), #96 (BUG-65). Relaunched as h-eng-bugs-b-cx1 (+ h-eng-bugs-a) on codex/gpt-6-luna. All 5 running workers are now on codex/gpt-6-luna.
- 02:28 merged: #706 WEB-11 (cache unchanged overlay recordings, crowd JS 10.08 -> 8.33 ms/frame, -17%), #707 SIM-12/wasm (send wasm frames as MessagePack bytes, delta decode -35%), #708 WEB-21 (skip unchanged special tile rebuilds, driver time -50%), xip #86 BUG-66 (stale SpriteLayer geometry reset). Steered h-xb-a-cx1 to leave xip #103 open (hits 37kB size gate) and continue XB-03/04.
- h-eng-bugs-b-cx1 (+ h-eng-bugs-a) DONE: merged xip #86 BUG-66 (SpriteLayer.resize zeroes new slot geometry). BUG-61..65, BUG-68, BUG-56, BUG-60 already merged (#78, #79, #81, #83, #96, #63, #80, #85). Left xip #90 BUG-67 open (reviewed & green except xipjs gzip 37,005 B vs 37,000 B budget; main is at 36,977 B).
- 02:32 launched h-eng-ctx-cx1 (+ h-eng-terrain) on codex/gpt-6-luna.
- 02:34 codex/gpt-6-luna hit usage limit (resets at 06:29 AM) after simq-wasm-cx1 merged #707 (SIM-12 MessagePack wasm frames, delta decode -35%) and finished SIM-14/SIM-15 (no-gain).
- 02:35 Relaunched all 5 active queues on antigravity/gemini-4-argon-medium (which has separate quota from flash): h-web-terrain-ag1, simq-wasm-ag1 (+ srv-followup), h-web-overlay-ag1, h-xb-a-ag2, h-eng-ctx-ag1 (+ h-eng-terrain).

## 09:15 resumed (USER "cont")
- 02:40-09:09 run stalled: antigravity (Gemini) quota exhausted for 6 days, killing its 5 workers and the heartbeat. OpenCode Go still "Go usage limit exceeded"; codex gpt-6-luna reset at 06:29 and works.
- Fixed BRIEF/HAIKU review target (was opencode "gemini-4-argon-high", which does not exist and opencode Gemini is out of funds) -> codex gpt-6-luna.
- Launched on codex gpt-6-luna (task prefix node:delegated-task:command%3Amcp%3Affb8ea78-056f-42f4-9c29-7f586a541d4f%3Adelegate-task%3A<id>): webq-wire-lx1 (#670 first), h-web-overlay-lx1, h-eng-ctx-lx1 (+ENG-05/06/07), h-sim-tick-a-lx1 (RUST), mobq-1-lx1 (#664, #667 first).
- 09:13 xip v0.15.4 RELEASED (xipjs + create-xip-game 0.15.4): #95 #102 #94 #97 #98 #99 #100 #101 #92 #79 #83 #96 #86. Queued app-xip-0154 at top of QUEUE.md. Heartbeat recreated as overnight-heartbeat-3 (60 min; old one was gone).
