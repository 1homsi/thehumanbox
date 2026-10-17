# Bugs backlog (scout run, 2026-10-16)

Sources: four read-only scouts (sim/stores, render/UI, Rust+desktop, engine) plus test-suite runs. IDs are stable; BUG-01..42 are `app`, BUG-43..68 are `engine`.

Confidence: `confirmed` = traced through callers (Rust ones marked 'Reproduced' were run in a throwaway harness); `likely` = code path is clear but the trigger depends on timing/environment. Nothing here was run in a live browser.

## Test-suite results

- **Rust** `cargo test --release --locked --workspace` on main 9f2ebb8a: all pass (910 + small suites, 0 failed, 1 ignored). (An earlier run failed to compile only because the shared checkout advanced mid-build.)
- **apps/web** `pnpm test` in the primary checkout: 37 failures, all in `src/game/render/cf/*` (`TextLayer is not a constructor`, `touchRange is not a function`). Cause is environmental: `apps/web/node_modules` holds `cubeforge` 0.11.0 while `package.json` now requires `xipjs ^0.15.0` (lockfile 0.15.0). Not a code bug; a worktree must run `pnpm install --frozen-lockfile` before testing. Don't open PRs for these.
- **engine** `pnpm test`: 2341/2342 pass; the one failure is a flaky test, see BUG-68.

## Quick triage (suggested order)

Highest value per size: BUG-01 (silent save loss), BUG-20 (map freezes after server restart), BUG-21 (minimized window re-downloads snapshot in a loop), BUG-31 (hidden tab downgrades GPU map for good), BUG-06 (startup backstop on wrong promise), BUG-02/03 (command overflow panics / off-map volcano), BUG-34, BUG-36, BUG-37, BUG-39, BUG-44, BUG-50, BUG-51, BUG-52, BUG-56, BUG-60.

## A1..A10 (CUBEFORGE_ENGINE_GAPS_FROM_SPIKES.md section A) on xip main

Engine scout header:, xip at origin/main 2351151 (rename cubeforge -> xip, #56)
Paths are relative to /Users/mhomsi/dev/extra/1homsi/cubeforge/cubeforge. Full `pnpm test` run (/tmp/engine-test.log):
2341/2342 pass; the single failure is a flaky test (BUG-68). Nothing else fails.
## A1..A10 status (section A of CUBEFORGE_ENGINE_GAPS_FROM_SPIKES.md) on current main
- A1 setTint lost after setTiles/fill: FIXED. packages/renderer/src/tileLayerGL.ts:674-677 re-uploads tints/biases with the full replace.
- A2 Line/Circle/Polygon/Gradient on WebGL: FIXED. webglRenderSystem.ts:2351-2395 draws them, :3150-3160 queues them in the sort.
- A3 usePostProcess/postProcessStack on WebGL: FIXED. webglRenderSystem.ts:1595-1631 `_applyEffectStack`, called at :3885.
- A4 onDemand drops frames: PARTIALLY FIXED. SpriteLayer has `onChange` (spriteLayer.ts:240,550) and `useSpriteLayer` wires it (hooks/useSpriteLayer.ts:86).
  STILL OPEN: TextLayer has no wake (BUG-47), React prop sync / async image load / canvas resize never call markDirty (BUG-46),
  and `markDirty()` before `start()` is still dropped (core/src/loop/gameLoop.ts:73, harmless because start() renders one frame).
  The `dirtyScheduled` early return (gameLoop.ts:74) is just coalescing; it is not a bug.
- A5 SpriteLayer.image never refreshed: FIXED (opt-in) via `markAtlasDirty()` (spriteLayer.ts:540, webglRenderSystem.ts:2577-2596). Side effect: pick masks stay stale (BUG-66).
- A6 `<Sprite width height>` not synced: FIXED. integrations/xip/src/components/Sprite.tsx:220+ sync effect writes width/height.
- A7 Camera2D reset on object prop identity + bounds larger than view: FIXED. Camera2D.tsx compares bounds by value; components/camera2d.ts:67-79 centres.
- A8 useCameraPanZoom: FIXED (ax/ay catch-up, wheelMaxDelta, pageHeight; hooks/useCameraPanZoom.ts). New issue: pointercancel counts as a tap (BUG-57).
- A9 touch default actions cancelled: MITIGATED, default unchanged. `touchPreventDefault` (input/src/touch.ts:12-23, Game prop) can be `'move'`/`false`,
  but the default `true` still cancels touchstart/touchend, so the synthesized `click` still never fires on the engine canvas.
- A10 mipmaps regenerated every draw: FIXED. webglRenderSystem.ts:2060-2093 builds the chain once per texture content (`mips` flag, `markTextureStale`).
Section B/C items that are correctness bugs:
- B7 picking: SpriteLayer fixed (pickIndex/pickId/pickKey/pickAll/pickNearest, hit rects, alpha test; spriteLayer.ts:925-1010). Residual: `SpriteLayer.pick()` and
  `TextLayer.pick()` (textLayer.ts:429-432) still return -1 for "miss", which is also a legal Int32 id. TextLayer has no pickId/undefined variant. Small API gap.
- B8 depth sort: FIXED. Float64 sortKey + sortKey2 tie-break, incremental insertion sort with full-sort fallback, hidden sprites left out (spriteLayer.ts:560-640).
- C stats / captureFrame / EngineContext export / Canvas2D fallback / TileLayer wake on setters: all landed. Only gap: `TileLayerData.setAnimations()`
  (tileLayer.ts:623-656) bumps `revision` but never calls `onChange` (setVariants does), so an on-demand loop is not woken. One-line fix, too small for its own entry.
- C Trail draw-call-per-trail is perf-only and was not assessed.
## Entries

Section D (app-side): keyboard focus after canvas click was fixed in #274; 'save a picture' black/touch taps are covered where still open by BUG-40 and the render fragment.

## BUG-01 — A save the sim cannot read as UTF-8 (or hits a transient read error on) is silently replaced by a fresh world

- **repo:** app
- **files:** crates/sim-core/src/sim/storage/persistence/file_io.rs:49, crates/sim-core/src/sim/storage/persistence/file_io.rs:88
- **repro/reasoning:** `load_or_new` uses `std::fs::read_to_string`. For any error other than NotFound (invalid UTF-8 from a bit-flipped or half-written save, EACCES, EBUSY from antivirus on Windows, EIO, EMFILE) the `Err(e)` arm logs "unreadable - starting fresh world" and returns `Self::new(seed)` WITHOUT moving the file aside (only the JSON-parse-failure arm backs up to `.corrupt-<ts>`). The first periodic checkpoint (SAVE_EVERY_TICKS=600, about 60 s) then atomically `rename`s over `world.save`, destroying the player's real world. Reproduced: wrote a valid 9.6 MB save, flipped one byte in the middle to 0xff, `Simulation::load_or_new` returned tick 0 and no backup file was created (directory contained only `world.save`, which the next save would overwrite).
- **fix:** read bytes with `std::fs::read`, then `from_slice`. For every non-NotFound failure rename the file to `world.save.unreadable-<ts>` (same as the corrupt branch) before starting fresh, and for transient kinds (PermissionDenied, WouldBlock, Interrupted, EBUSY) retry a few times with backoff or refuse to start rather than falling through to a new world. Add a test with invalid UTF-8 bytes asserting a backup exists.
- **confidence:** confirmed
- **size:** S

## BUG-02 — Clamped command coordinates still overflow i32 in squared-distance math (debug panic, wrapped aliasing in release)

- **repo:** app
- **files:** crates/sim-core/src/sim/command/mod.rs:279, crates/sim-core/src/sim/command/buildings.rs:7, crates/sim-core/src/sim/tech/plantings.rs:133, crates/sim-core/src/world/grid.rs:109, crates/sim-core/src/sim/command/disasters.rs:29, crates/sim-core/src/sim/command/miracles.rs:34, crates/sim-core/src/sim/command/clear_region.rs:16, crates/sim-core/src/sim/command/rain_patch.rs:16, crates/sim-core/src/sim/command/blessings.rs:165
- **repro/reasoning:** `clamp_cmd_coord` clamps to +/-100_000 and its doc claims `coord + offset` cannot overflow, but several callers then square the distance: `footprint_touches` (`dx*dx + dy*dy`, used by `demolish` and `repair`), `in_disc` (`dx*dx + dy*dy`, used by `wither_plantings`/`frost_plantings`, i.e. `blight`, `blizzard`), and `raise_volcano` (`(v.x - x).pow(2)`). 100_000^2 = 1e10 > i32::MAX. The f32 commands do `x as i32` (saturates at i32::MAX/MIN for x=+/-1e10) and then `cx + dx` or `nx - x` (`bless_forest`, `bless_river`, `clear_region`, `rain_patch`, `harvest`, `smite` via `strike_buildings(.. x as i32 ..)`, `thunder` via smite). I generated 43,826 command payloads (every Command variant, extreme x/y/radius) and ran them in a debug build: 10 distinct panics, all triggered by one POST body: demolish/repair `{"x":100000,"y":100,"radius":100}` (multiply overflow), volcano same body (pow overflow), blight with an existing planting `{"x":100000,"y":100,"radius":5}` (confirmed panic), smite/thunder `{"x":-1e10,...}` (subtract overflow), bless_forest/bless_river/clear_region/harvest/rain_patch `{"x":1e10,...}` (add overflow). The panic unwinds while the sim mutex is held inside the axum handler. In release the arithmetic wraps, so e.g. x = building.x+65536 makes `dx*dx` wrap to 0 and `demolish` hits a building 65 k tiles from the click (aliasing).
- **fix:** reject out-of-world points up front in the command layer: for i32 commands `if !WorldGrid::in_bounds(x, y) { return false }` (meteor/earthquake already do) or clamp to `-64..WIDTH+64`; for f32 commands clamp x/y to `-64.0..=WIDTH+64.0` before any `as i32`. Also switch `in_disc`, `footprint_touches` and `raise_volcano` to i64 or `saturating_mul`. Add a regression test that feeds the 10 payloads above to `apply_command_json` under `cargo test` (debug, overflow checks on).
- **confidence:** confirmed
- **size:** M

## BUG-03 — Volcano command registers a volcano anywhere in the plane, polluting and persisting `placed_volcanoes`

- **repo:** app
- **files:** crates/sim-core/src/sim/command/disasters.rs:835, crates/sim-core/src/sim/command/disasters.rs:891, crates/sim-core/src/world/grid.rs:108
- **repro/reasoning:** `cmd_volcano` clamps to +/-100_000 but never checks `in_bounds`; the tile loop skips out-of-bounds tiles, `changed` stays false, yet line 891 unconditionally calls `self.grid.raise_volcano(x, y, r)` and a "burst from the ground" event is pushed. Reproduced: `{"cmd":"volcano","x":50000,"y":50000,"radius":5}` on a fresh world takes `grid.placed_volcanoes.len()` from 0 to 1 (the command then returns false, but the volcano stays). `raise_volcano` evicts the oldest placed volcano past MAX_PLACED_VOLCANOES=48, so 48 off-map posts erase every legitimate player volcano; the entries are serialized into the save (`to_save.rs:88`) and re-raised on load (`from_save.rs:42`), and `raise_volcano` also removes world-gen volcanoes whose cone it "covers" using the overflow-prone `pow(2)`.
- **fix:** `if !WorldGrid::in_bounds(x, y) { return false; }` at the top of `cmd_volcano` (same as `cmd_meteor`), and only call `raise_volcano` when `changed`. In `from_save` drop saved volcanoes that are out of bounds.
- **confidence:** confirmed
- **size:** S

## BUG-04 — Unauthenticated sandbox endpoints accept cross-site requests (CSRF), and CORS "null" origin is allowed for all pages

- **repo:** app
- **files:** apps/server/src/router.rs:51, apps/server/src/routes.rs:87, apps/server/src/config.rs:124, apps/desktop/main/sim-env.ts:17
- **repro/reasoning:** the desktop sim exposes `POST /command`, `POST /save`, `/runtime` on 127.0.0.1:<random port> with no token and no Origin check. `command_handler` takes `body: String`, so it accepts any Content-Type; a page on any website can send `fetch("http://127.0.0.1:PORT/command", {method:"POST", mode:"no-cors", body:'{"cmd":"nuke",...}'})` (a CORS "simple request", no preflight, response not needed). The port is ephemeral and discoverable by probing. Additionally `THB_EXTRA_CORS_ORIGINS=null` plus the local-profile `null` entry means any sandboxed iframe / data: URL page (which sends `Origin: null`) passes CORS with full read access to `/runtime`, `/version`, `/snapshot`, etc. Chrome's Private Network Access/Local Network Access prompts mitigate some browsers, not all (Firefox/Safari, older Chromium). Result: a visited web page can meteor/smite the player's world or change sim speed.
- **fix:** generate a random per-launch secret in Electron (`crypto.randomUUID()`), pass it to the sim as `THB_COMMAND_TOKEN` and to the renderer via the query string / preload bridge, and require an `x-thb-token` header on `/command`, `/runtime` POST and `/save` (constant-time compare); additionally reject requests whose `Origin` header is present and not in the allow-list, and require `Content-Type: application/json` on `/command`. Drop the generic `null` CORS origin once the token exists.
- **confidence:** likely
- **size:** M

## BUG-05 — `world_store` (dead-organism memory DB) stays bound to the old live world after archive_and_reset

- **repo:** app
- **files:** apps/server/src/world_archive.rs:226, apps/server/src/main.rs:62, apps/server/src/main.rs:154, apps/server/src/tick_loop.rs:113, apps/server/src/routes.rs:428
- **repro/reasoning:** `WorldStore::open(&live_hash)` runs once at startup and the `Arc` is cloned into `AppState` and `TickLoop`. `archive_and_reset` (monthly rollover on hosted profiles, and `POST /admin/reset-world`) swaps `*sim = next`, writes a new `_live` marker, and deletes the old live `world.save`, but never reopens the store. All dead-organism memory flushes from the new world are written into `worlds/<old live hash>/world.sqlite` (a folder that is no longer listed or live) and `org_detail_handler`/`org_life_handler` read them back from the same stale handle. After the next process restart `WorldStore::open(new_live_hash)` opens an empty DB, so every post-reset dead person loses their memories and the old folder keeps growing.
- **fix:** put the store behind `Arc<RwLock<Option<Arc<WorldStore>>>>` (or ArcSwap) shared by `TickLoop` and `AppState`, and have `archive_and_reset` open the new hash and swap it in after `set_live_world_hash` succeeds.
- **confidence:** confirmed
- **size:** M

## BUG-06 — The "startup backstop" in `index.ts` is attached to the wrong promise, so a rejected boot step still leaves a windowless, handler-less app

- **repo:** app
- **files:** apps/desktop/main/index.ts:510, apps/desktop/main/index.ts:599
- **repro/reasoning:** `app.whenReady().then(async () => { ... await createWindow(); buildMenu(); buildTray(); ... ipcMain.handle(...) ... })` has no `.catch`. The later `void app.whenReady().catch(...)` only observes `whenReady()` itself (which resolves), never the rejection of the `.then(async ...)` chain, so the dialog/`app.exit(1)` never runs. If `createWindow()` rejects (invalid `x`/`y`/`width` types in a hand-edited window-state.json throwing in `new BrowserWindow`, or `win.loadFile` rejecting because `renderer/index.html` is missing or the navigation is aborted), the chain aborts: no application menu, no tray, no global shortcuts, no updater, and none of the `app:*` IPC handlers get registered (they are registered after `await createWindow()`), so every later renderer call to `thbDesktop.app.*` rejects with "No handler registered". The comment above the block claims the opposite.
- **fix:** attach the catch to the same chain: `app.whenReady().then(boot).catch(fatal)` (move the body to a named `boot()` function), and register all `ipcMain.handle("app:*")` calls before `await createWindow()` so the renderer can never call an unregistered channel.
- **confidence:** confirmed
- **size:** S

## BUG-07 — Desktop `appVersion` is always empty in packaged builds

- **repo:** app
- **files:** apps/desktop/preload/index.ts:64, apps/web/src/ui/modals/DesktopSettingsModal.tsx:422
- **repro/reasoning:** the bridge sets `appVersion: process.env.npm_package_version ?? ""`. `npm_package_version` only exists when Electron is launched through an npm/pnpm script, and the sandboxed preload (sandbox: true) only sees a limited `process`; a packaged app launched from Finder/Start menu has no such variable, so the settings modal shows "v . darwin" (empty version) for every real user. `app.getVersion()` (main process) is the correct source.
- **fix:** add `ipc.handle("app:version", () => app.getVersion())` (or `ipcRenderer.sendSync` once at preload) and expose it as `appVersion`.
- **confidence:** confirmed
- **size:** S

## BUG-08 — Global (system-wide) shortcuts hijack Ctrl/Cmd+Shift+I, +S, +H in every other application

- **repo:** app
- **files:** apps/desktop/main/index.ts:518, apps/desktop/main/index.ts:528, apps/desktop/main/index.ts:532
- **repro/reasoning:** `globalShortcut.register` binds OS-level hotkeys that fire even when the app is in the tray or in the background. The app registers DevTools (Cmd+Alt+I / Ctrl+Shift+I), screenshot (Cmd+Shift+S / Ctrl+Shift+S) and toggle-window (Cmd+Shift+H / Ctrl+Shift+H). While The Human Box runs, Ctrl+Shift+I (browser devtools), Ctrl+Shift+S (Save As in many editors/browsers) and Cmd+Shift+H (Finder Home) no longer reach other apps, and the DevTools shortcut toggles the desktop app's devtools from anywhere. The menu already defines the same accelerators locally (index.ts:308, 330), so the global registration is redundant for the first two. Return values (registration failure when another app owns the key) are ignored too.
- **fix:** delete the DevTools and screenshot `globalShortcut` registrations (keep the menu accelerators, gate DevTools behind `isDev`), and if a global show/hide hotkey is wanted use a rarely-used combo, make it opt-in in settings, and log when `register` returns false.
- **confidence:** confirmed
- **size:** S

## BUG-09 — "Start minimized" setting is a no-op on Windows/Linux (and on modern macOS)

- **repo:** app
- **files:** apps/desktop/main/index.ts:482, apps/desktop/main/index.ts:121
- **repro/reasoning:** `applyAutoLaunch` passes `openAsHidden: s.startMinimized` to `app.setLoginItemSettings`. `openAsHidden` is macOS-only and deprecated (ignored on macOS 13+). `createWindow` never reads `settings.startMinimized` and constructs the BrowserWindow with default `show: true`. With "Launch at login" + "Start minimized" on Windows/Linux the window pops up at every login anyway.
- **fix:** on non-mac pass `args: ["--hidden"]` to `setLoginItemSettings`; in `createWindow` use `show: false` when `process.argv.includes("--hidden")` (or `app.getLoginItemSettings().wasOpenedAtLogin && settings.startMinimized`) and show it on `ready-to-show` otherwise; keep tray-only start in that case.
- **confidence:** confirmed
- **size:** S

## BUG-10 — `did-fail-load` replaces the whole app with the error page for sub-frame failures and superseded navigations (ERR_ABORTED)

- **repo:** app
- **files:** apps/desktop/main/index.ts:217
- **repro/reasoning:** the handler `(_e, code, desc, url) => win.loadURL(renderBootError(...))` ignores the `isMainFrame` argument and `errorCode === -3` (ERR_ABORTED, emitted whenever a navigation is cancelled by a newer one). `loadLocalRenderer` (ipc.ts:105, used by sim:restart, migrateDataRoot, resetLocal) calls `win.loadFile` on a window that may still be loading/reloading, and `createWindow` itself may race a reload; the aborted first load fires did-fail-load with -3 and the handler issues a competing `loadURL(errorPage)`, so depending on ordering the user ends on "Renderer failed to load. Code: -3" after a successful migration/restart. Any iframe/subresource-document failure in the renderer triggers the same replacement.
- **fix:** `(_e, code, desc, url, isMainFrame) => { if (!isMainFrame || code === -3) return; ... }`.
- **confidence:** likely
- **size:** S

## BUG-11 — Window can restore off-screen (no display bounds check) and a malformed window-state.json aborts window creation

- **repo:** app
- **files:** apps/desktop/main/index.ts:43, apps/desktop/main/index.ts:158
- **repro/reasoning:** `loadWindowState` returns `x`/`y` verbatim from disk with no type or visibility validation; `persistWindowState` saves them whenever the window moves. After unplugging/rearranging a monitor (or a docked laptop), the next launch positions the window outside every display, and `minWidth: 1000/minHeight: 700` windows cannot be dragged back easily. A non-numeric `x` (hand edit, partial write: `fs.writeFileSync` here is not atomic) makes `new BrowserWindow` throw inside `createWindow`, which feeds the unhandled boot rejection above.
- **fix:** validate `typeof x === "number" && Number.isFinite(x)`, and use `screen.getDisplayMatching({x,y,width,height})` / `screen.getAllDisplays()` to drop x/y when the rect does not intersect any `workArea`; write the file with the existing `atomicReplaceFile`.
- **confidence:** likely
- **size:** S

## BUG-12 — No navigation guard in the BrowserWindow, and `window.open` hands any URL scheme to `shell.openExternal`

- **repo:** app
- **files:** apps/desktop/main/index.ts:212, apps/desktop/main/index.ts:158
- **repro/reasoning:** there is no `will-navigate`/`will-frame-navigate` handler. Dropping a file or link onto the window (default Chromium behaviour) or an in-page `<a href>` navigates the main window away from the app to that URL (e.g. a dropped `.html`/`.save` file), and the preload bridge (`thbDesktop.world.migrateDataRoot`, `resetLocal`, `settings.set`) is re-injected into whatever page loads, with file:// origin if it is a local file. Separately `setWindowOpenHandler` calls `shell.openExternal(url)` for any URL a renderer opens, including `file:`, `smb:` and custom-protocol URLs.
- **fix:** `win.webContents.on("will-navigate", (e, url) => { if (url !== win.webContents.getURL() && !url.startsWith(<file URL of renderer dir>)) e.preventDefault(); })`, and in the open handler only forward `https:`/`http:` URLs after `new URL(url)` validation. Also set `win.webContents.session.setPermissionRequestHandler` to deny.
- **confidence:** likely
- **size:** S

## BUG-13 — Menu "Restart simulation" fails silently (and cannot recover a hung sim)

- **repo:** app
- **files:** apps/desktop/main/index.ts:253, apps/desktop/main/index.ts:297, apps/desktop/main/sim-process.ts:684
- **repro/reasoning:** the menu action is `void restartSimulation().catch(console.error)`. It calls `stopSim(5_000, true)`, which throws "could not checkpoint the active world; it remains open" whenever `/save` does not answer within 3 s, i.e. exactly when the sim is hung/slow, and `runExclusiveDesktopOperation` throws "cannot restart ... while X is still in progress". Neither produces any UI: the user clicks Restart, nothing happens, no dialog, and (since checkpoint is required) the sim can never be killed except by quitting the app. The IPC path (`sim:restart`) at least returns the error to the renderer; the menu path swallows it.
- **fix:** `.catch((err) => dialog.showErrorBox("Could not restart the simulation", err.message))`; offer a "Restart without checkpoint (may lose up to 60 s of progress)" button that calls `stopSim(5000, false)` when the checkpoint failed.
- **confidence:** confirmed
- **size:** S

## BUG-14 — `startSimOnce` leaks a handed-over data-root lock if `prepareDataRoot` throws

- **repo:** app
- **files:** apps/desktop/main/sim-process.ts:460, apps/desktop/main/ipc.ts:340
- **repro/reasoning:** every other early exit in `startSimOnce` calls `suppliedLock?.release()`, but `const workdir = prepareDataRoot(settings);` (line 460) is not inside any try. `prepareDataRoot` throws for a custom save folder whose identity file is unreadable/invalid or whose folder went away (`requireOrUpgradeDataRootIdentity`). In `migrateDataRoot` and `resetLocal` the lock is passed as `handedLock` and the caller has already nulled its own reference (`targetLock = null` / `operationLock = null`), so nobody releases it. The lock directory `.thehumanbox-data.lock` owned by the live Electron pid then stays on disk, and every later `acquireDataRootLock` for that root fails with "already open by another The Human Box process (pid <our own pid>)" until the app restarts.
- **fix:** wrap `prepareDataRoot` in the same try/catch as `pickFreePort` and release `suppliedLock` on failure (or restructure the function with a single `try { ... } catch { suppliedLock?.release(); throw }`).
- **confidence:** confirmed
- **size:** S

## BUG-15 — Sim startup readiness: fixed 15 s window with no check that the listener is the child, and the sim binds only after loading the whole world

- **repo:** app
- **files:** apps/desktop/main/sim-process.ts:92, apps/desktop/main/sim-process.ts:109, apps/desktop/main/sim-process.ts:597, apps/server/src/main.rs:61, apps/server/src/main.rs:187
- **repro/reasoning:** (1) Rust does `load_or_new` (read + serde parse + `from_save` + rebuilds), opens SQLite, encodes the first full frame, and only then `TcpListener::bind` (main.rs:187). Electron SIGKILLs the child if nothing listens within 15 000 ms (`waitForPort(port, 15000, ...)` then `child.kill("SIGKILL")`). A mature world with a save in the 50-200 MB range on a slow disk/laptop can exceed 15 s of load time, so the app kills the sim mid-start on every launch ("did not start listening within 15000ms") and the player cannot open their world. (2) `pickFreePort` closes its probe server before spawn, so another process can take the port in between; `waitForPort` then succeeds against the foreign listener (any TCP accept counts) while the sim is still loading, and the app proceeds with `apiBase` pointing at the wrong service until the sim later exits on EADDRINUSE.
- **fix:** bind the listener (or a tiny "loading" HTTP responder) before loading the world and have `waitForPort` poll `GET /health` expecting `{"sim_alive":...}` or a `/version` name match; extend the deadline when the child is alive and its stdout shows load progress (e.g. 120 s), and retry `pickFreePort` once on EADDRINUSE exit.
- **confidence:** likely
- **size:** M

## BUG-16 — Desktop runs the sim with the hosted-box memory watchdog thresholds, which destructively trim large local worlds

- **repo:** app
- **files:** apps/server/src/startup.rs:64, apps/desktop/main/sim-env.ts:9, crates/sim-core/src/sim/simulation/memory.rs:4, apps/server/src/tick_loop.rs:76
- **repro/reasoning:** `build_memory_watch` defaults to RSS elevated 320 MB / critical 480 MB (tuned for a small hosted box). `buildLocalSimEnv` does not set `MEM_RSS_*`, `MEM_FLOOR_*` or `THB_LOW_MEMORY`, so a desktop player on a 16 GB machine gets the same limits (macOS RSS is measured via `ps`). The player-selectable population cap goes up to 5000 (settings.ts), and a long-lived world's RSS easily exceeds 480 MB. Every 30 ticks `apply_memory_pressure` then runs: Elevated drops dead organisms and trims cognition; Critical removes all dead organisms, truncates life logs/thought history/conversations/events/story_history/pop_history/era_history, and deletes `lineage_names` / strategies / centroid history for extinct lineages. These are permanent (the trimmed state is then written to `world.save`), so a player's chronicle and tribe names are silently erased once the process is big.
- **fix:** in `buildLocalSimEnv` set `MEM_RSS_ELEVATED_MB=0` and `MEM_RSS_CRITICAL_MB=0` (the classifier already treats 0 as disabled) and floors based on host memory, e.g. 512/256 MB of *available* RAM; make the pressure response non-destructive (skip the chronicle truncation) when `THB_PROFILE=local`.
- **confidence:** likely
- **size:** S

## BUG-17 — No liveness watchdog for the sim child or the tick task: a crashed/stalled sim leaves the UI dead until the user notices

- **repo:** app
- **files:** apps/desktop/main/sim-process.ts:539, apps/server/src/tick_loop.rs:42, apps/server/src/routes.rs:733
- **repro/reasoning:** (a) Electron only logs `[sim] exited code=...` and nulls `current`; nothing polls `/health` or restarts, and the renderer is not told (no IPC event), so if `simulation-rs` crashes (OOM, panic hook abort) the window keeps showing a frozen map until the player thinks to use Restart. (b) Inside the Rust process the tick loop and broadcaster are `tokio::spawn`ed with no `catch_unwind`/JoinHandle supervision: any panic inside `s.tick_n(..)` (including the debug-build overflow panics above, or any sim bug) kills only that task. The HTTP server, WebSocket and `/save` keep working, saving the stale world, while time never advances; `/health` flips to 503 after 30 s but nothing consumes it. The process neither exits (so no orphan recovery) nor restarts the loop.
- **fix:** in Rust wrap the tick body in `std::panic::catch_unwind` (log, count, continue) or abort the process on tick-task failure (`if let Err(e) = tick_task.await { std::process::exit(101) }` from a monitor task) so Electron can restart it; in Electron add an `app:simExited` IPC event to the renderer plus an optional bounded auto-restart (max N in M minutes) and a `/health` poll every ~10 s.
- **confidence:** likely
- **size:** M

## BUG-18 — Sim stdout/stderr are only echoed to the parent's stdout, so the "logs folder" and the boot error's "check the logs" point at an empty directory (and a closed pipe can kill the app)

- **repo:** app
- **files:** apps/desktop/main/sim-process.ts:586, apps/desktop/main/index.ts:416, apps/desktop/main/index.ts:562, apps/desktop/main/sim-process.ts:379
- **repro/reasoning:** tray "Open logs folder" and `app:openLogs` open `app.getPath("logs")`, and the boot error page says "Check the logs for details", but nothing in `apps/desktop` writes any file there (only the last 40 chunks are kept in memory to build the startup error message; `grep` finds no log file writer). Sim output goes to `process.stdout.write`/`process.stderr.write` only. When the app was started from a terminal that is later closed (or any pipe consumer that exits), those writes raise EPIPE/EIO as an `uncaughtException`, which `installExitHandlersOnce` handles with `stopAndExit(1)`, i.e. the whole app quits because of a logging write.
- **fix:** pipe child stdout/stderr (and main-process `console.*`) into a rotating file under `app.getPath("logs")` (e.g. `fs.createWriteStream(path, {flags:"a"})` with size rotation), attach `process.stdout.on("error", () => {})`/`stderr` no-op handlers, and drop the direct `process.stdout.write` echo when `app.isPackaged`.
- **confidence:** likely
- **size:** S

## BUG-19 — Save-folder lock treats any live process with the recorded pid as "another The Human Box instance" (pid reuse)

- **repo:** app
- **files:** apps/desktop/main/data-lock.ts:57, apps/desktop/main/data-lock.ts:200, apps/desktop/main/data-lock.ts:158
- **repro/reasoning:** after a crash, force-quit, or reboot the stale `.thehumanbox-data.lock/owner.json` still names the old Electron pid. `acquireDataRootLock` only calls `processIsAlive(owner.pid)` (a bare `process.kill(pid, 0)`); if the OS has since handed that pid to any unrelated process (very common after a reboot with small pid spaces, and on Windows pids are aggressively recycled), startup fails with "this save folder is already open by another The Human Box process (pid N)" and the player cannot launch the app until that unrelated process exits or they delete the hidden lock folder by hand. The sim.pid side already guards against this with `pidBelongsToSimulation`; the Electron-owner side does not.
- **fix:** record the owner's process start time (or executable path via `app.getPath("exe")`) in `owner.json` and treat the lock as stale when the live pid's start time/command differs (`ps -o lstart=,comm=` / `wmic`/`Get-Process`), or add an `acquiredAt` vs. boot-time comparison; at minimum offer an in-app "remove stale lock" action in the error dialog.
- **confidence:** likely
- **size:** M

## BUG-20 — Failed /snapshot after a server restart restores the old frame id, so every new frame is dropped as stale

- **repo:** app
- **files:** apps/web/src/simulation/useSimulation.ts:184, apps/web/src/simulation/useSimulation.ts:196-219, apps/web/src/simulation/useSimulation.ts:250-252, apps/server/src/main.rs:83, apps/server/src/routes.rs:285-302, apps/web/src/ui/modals/DesktopSettingsModal.tsx:353
- **repro/reasoning:** The server frame clock is `AtomicU64::new(0)` (main.rs:83), so frame ids restart at 1 after any server restart. Desktop Settings -> "restart" calls `desktop.sim.restart()` without a page reload. The WebSocket reconnects, `onopen` calls `requestSnapshotResync()`, and that zeroes `lastFrameIdRef` but keeps the old value in `savedLastFrameId`. While the new server has no `latest_full` yet, `/snapshot` returns 503 (routes.rs:301). `fetchSnapshotWithProgress` maps that to `null`. The `buf == null` branch (line 199) then restores `lastFrameIdRef = savedLastFrameId`, which is the old high id. `scheduleSnapshotRetry` only retries when `currentWorldRef.current === null` (line 191), and the client already has a world, so there is no retry. From then on `parsed.frame_id <= lastFrameIdRef.current` (line 250) drops every frame from the new server. The map freezes until the new server's ids pass the old ones, which can be an hour or more. The frame-gap/`awaitingFullFrame` logic never runs because the stale check `continue`s first.
- **fix:** On the null/failed snapshot paths do not restore `savedLastFrameId`. Leave `lastFrameIdRef` at 0, and let the first full frame re-seed it. Also have the retry fire whenever `awaitingFullFrameRef` is true, not only when `currentWorldRef` is null. Optionally treat a frame whose id is far below `lastFrameIdRef` as a server reset and resync instead of skipping it.
- **confidence:** confirmed
- **size:** S

## BUG-21 — Minimized/hidden desktop window re-downloads the full snapshot in a loop

- **repo:** app
- **files:** apps/web/src/simulation/useSimulation.ts:134-161, apps/web/src/simulation/useSimulation.ts:140-149, apps/web/src/simulation/useSimulation.ts:207-209, apps/web/src/simulation/useSimulation.ts:676-678
- **repro/reasoning:** Flushing is rAF-driven (`scheduleFlush`). A minimized or hidden Electron window gets no rAF (background throttling is on by default), but the local server keeps broadcasting. `parkSocket` returns early for `IS_LOCAL_SERVER` (line 677), so the socket stays open. When `queuedMsgs` reaches 32, `enqueueMessage` does `shift()` and `markAwaitingFullFrame()`. That arms a 250 ms timer, which calls `requestSnapshotResync()`. The snapshot is `unshift`ed to the front of the queue (line 207). The very next message finds the queue at 33 >= 32 and `shift()`s the snapshot off, so `markAwaitingFullFrame` runs again. The result is a continuous loop of multi-MB snapshot downloads and decodes for as long as the window stays minimized. `pauseWhenHidden` only pauses the renderer, not this path. It also burns CPU and bandwidth on a "toaster" machine.
- **fix:** In `enqueueMessage`, when `document.hidden` (or the desktop-inactive state) is true, do not buffer or trigger snapshot fetches. Drop the message, set `awaitingFullFrameRef = true` without scheduling a fetch, and let the existing visibility handler do the single forced resync on return. Also never `shift()` the bootstrap snapshot (index 0) when trimming the queue.
- **confidence:** confirmed
- **size:** S

## BUG-22 — Desktop runtime state (paused / speed) is hydrated only once, so the UI is wrong after a sim restart or reconnect

- **repo:** app
- **files:** apps/web/src/simulation/useSimulation.ts:569-578, apps/web/src/simulation/useSimulation.ts:632-639, apps/web/src/App.tsx:499-507, apps/web/src/ui/modals/DesktopSettingsModal.tsx:353
- **repro/reasoning:** `fetchRuntimeControlState(`${API_BASE}/runtime`)` runs only when the effect mounts (line 571-578). After the player pauses (or sets 5x) and then restarts the simulation from Settings, or after any WebSocket reconnect to a restarted server, the new server runs unpaused at 1x. `runtimeState` still says `paused: true` / `speed: 5`. The play/pause tool (App.tsx:499) shows "play" while the world is moving, and the speed chip is wrong. Clicking "play" then sends `resume` to an already-running server.
- **fix:** Re-run the hydration (through `runtimeControlQueueRef`) in `ws.onopen` for the desktop source, and after `desktop.sim.restart()` resolves. Reuse `reconcileRuntimeState`.
- **confidence:** confirmed
- **size:** S

## BUG-23 — Snapshot `.finally` of an aborted request clears the pending flag of its replacement

- **repo:** app
- **files:** apps/web/src/simulation/useSimulation.ts:172-179, apps/web/src/simulation/useSimulation.ts:220-223
- **repro/reasoning:** `requestSnapshotResync(true)` (the visibilitychange/online path) aborts the in-flight fetch A and sets `snapshotPendingRef = true` for fetch B. A's chain ends in `.finally(() => { ...; snapshotPendingRef.current = false })`, which runs unconditionally. `fetchSnapshotWithProgress` swallows the abort and resolves `null`, so the finally does run and wipes the flag while B is still downloading. The next non-forced call (the `markAwaitingFullFrame` timer, or `ws.onopen`) then sees `snapshotPendingRef === false` and starts fetch C concurrently. C also overwrites `snapshotAbort`, so B can no longer be aborted. The result is duplicate multi-MB downloads, two snapshots unshifted into the queue, and `bootstrapPendingRef` cleared by whichever finishes first.
- **fix:** Guard the finally: only clear `snapshotPendingRef` when `snapshotAbort === ctl` (or `!ctl.signal.aborted`), the same condition already used for `snapshotAbort`.
- **confidence:** likely
- **size:** S

## BUG-24 — WebSocket backoff resets on `open`, so a server that accepts and immediately closes is hit every ~0.5-1 s with a snapshot fetch

- **repo:** app
- **files:** apps/web/src/simulation/useSimulation.ts:584-600, apps/web/src/simulation/useSimulation.ts:632-639, apps/web/src/simulation/useSimulation.ts:640-654
- **repro/reasoning:** `ws.onopen` sets `reconnectDelayMs = 1000` and `attempts = 0` immediately, and calls `requestSnapshotResync()`. If the server upgrades the socket and then closes it (overload shedding, capacity close, reverse-proxy idle kill), `onclose` schedules a reconnect at `1000 * jitter`. The doubling in `scheduleReconnect` never takes effect because every cycle resets it. Every cycle also triggers a snapshot download. This is the herd behaviour the jitter comment says it is trying to avoid. `failedAttempts` also flips back to 0, so the status flickers connected/connecting instead of reaching "unreachable".
- **fix:** Reset `reconnectDelayMs`/`attempts` only after the connection proves healthy (for example after the first merged frame, or after it has stayed open for ~5 s). Keep the backoff otherwise.
- **confidence:** likely
- **size:** S

## BUG-25 — Safe reload/reset/restore is refused while the worker is still booting or has no write lock, so the splash "reload" button does nothing

- **repo:** app
- **files:** apps/web/src/simulation/wasmWorker.ts:188-190, apps/web/src/simulation/wasmWorker.ts:411-416, apps/web/src/simulation/wasmWorker.ts:623-650, apps/web/src/simulation/wasmPersistence.ts:83-99, apps/web/src/simulation/useSimulation.ts:485-509, apps/web/src/main.tsx:31, apps/web/src/simulation/worldSource.ts:102-126
- **repro/reasoning:** `prepare_reload` runs `runReloadCheckpoint` -> `persist()`. `persist()` returns false when `!sim || !storageReady`. In two states there is nothing to lose, yet the reload is refused. (a) The worker is still in `start()` (wasm init or lock wait; `sim === null`). (b) Another tab holds the world lock (`storageReady = false`, the fresh world is never saved by this tab). The worker replies `reload_result ok:false`. The main thread then shows "could not checkpoint the current world; refresh was cancelled safely" and does not reload. The splash "reload" button, which appears after 15 s when startup is stuck, is registered with `{ once: true }` (main.tsx:31), so after one refused click it is dead. Reset/recovery (`requireLocalWorld`) behave the same. Side effect: on the failed path `resume()` calls `beginLoop()` before `start()` has finished, creating a tick timer and an autosave `setInterval`. `start()` later calls `beginLoop()` again, which clobbers `saveTimer` without clearing the earlier interval, so there are two autosave intervals.
- **fix:** In the `prepare_reload` handler, if `sim === null` or `!worldLockAcquired`, reply `ok:true` right away (release the lock and `self.close()` as on the success path). In `beginLoop`, call `stopTimers()` first, and have `resume` skip `beginLoop` when `sim === null`. Drop `{ once: true }` on the splash button.
- **confidence:** confirmed
- **size:** M

## BUG-26 — Focusing a tribe that then goes extinct leaves the whole map dimmed with no tribe card

- **repo:** app
- **files:** apps/web/src/App.tsx:540-546, apps/web/src/game/render/cf/people/people-sprites.ts:73-75, apps/web/src/ui/panels/TribeCard.tsx:72-74, apps/web/src/game/model/tribe-status.ts:60-62, apps/web/src/state/ui/slices/overlay.ts:36-37
- **repro/reasoning:** The user focuses a tribe (`focus = 'lineage:X'`) and the tribe dies out (or the world is replaced). `isFocused()` returns `org.lineage_id === X` for the remaining people, so every living person is drawn at alpha 0.12 (people-sprites.ts:356, people-labels.ts:285). `TribeCard` returns null because `tribeStatus()` is null for a lineage with no living members. The lineage row for X also disappears from `LineagesList`. Nothing resets `focus`. App reconciles `selectedOrgId` against the world (App.tsx:540) but has no equivalent for `focus`. The only escape is the "more" dropdown's "all" button, which most players will not guess.
- **fix:** Add an effect next to the `reconcileViewerSelection` one: if `focus` starts with `lineage:` and no living organism has that `lineage_id`, call `setFocus('all')`.
- **confidence:** confirmed
- **size:** S

## BUG-27 — Eldest-per-tribe stamp is split on `|`, so a custom name containing `|` corrupts the display

- **repo:** app
- **files:** apps/web/src/ui/panels/LineagesList.tsx:77-83, apps/web/src/ui/panels/LineagesList.tsx:91, apps/web/src/game/model/tribe-eldest.ts:31, apps/web/src/ui/panels/RenameForm.tsx:36-47
- **repro/reasoning:** `eldest[lid] = `${e.name}|${e.days}`` is parsed back with `.split('|')` and `Number(e[1])`. `e.name` is `o.custom_name?.trim() || o.name`, and custom names are free text (RenameForm only limits the length to 24). Renaming the oldest person of a tribe "a|b" makes the list row show "⌛NaNd" (`Number('b')`), and the tooltip name is truncated to "a". The same happens for any name containing `|`.
- **fix:** Select `{name, days}` fields into a flat `useShallow` key without string packing (for example two parallel records, or JSON.stringify per lineage), or use `lastIndexOf('|')` when splitting.
- **confidence:** confirmed
- **size:** S

## BUG-28 — Delta frames never clear `partner_id` / `attracted_to`, so dissolved partnerships persist until the next full frame

- **repo:** app
- **files:** apps/web/src/simulation/wire.ts:213-223, apps/web/src/simulation/wire.ts:270-271, crates/sim-core/src/organism/organism/json.rs:845-850, apps/web/src/simulation/merge.ts:110-115
- **repro/reasoning:** The server SoA delta sends `partner_ids` / `attracted_tos` sparsely: "Absent -> unpartnered" (json.rs:753-755, only pushed when `Some`). The array is always serialized, `[]` when nobody is partnered. `expandOrgsSoa` only assigns `entry.partner_id` when the index is present in the sparse list. For `[]`, `isSparseStringArray` is false and the dense fallback does `dense[i] ?? undefined`, which is `undefined`, meaning "unchanged" to `mergeDefined`. The clear (`null`) is never produced, even though the wander-target code right below it does emit `null` for its sentinel. So when a partnership ends (death, split, attraction fades) the cached `partner_id` / `attracted_to` stays set until the next full AoS frame, which has `partner_id: null`. Partner lines and attraction state in the map overlays stay stale for that whole interval (~36 s on the wasm cadence).
- **fix:** In `expandOrgsSoa`, when `soa.partner_ids` is an array (sparse or empty), initialise `partnerAt` for every index so absent ones become `null` (and the same for `attracted_tos`); only keep "unchanged" semantics for a missing field. Update the legacy dense path to map `null` to `null`, not `undefined`.
- **confidence:** confirmed
- **size:** S

## BUG-29 — `renamingOrgId` outlives the selection, so the rename form reappears later

- **repo:** app
- **files:** apps/web/src/state/ui/slices/selection.ts:21-40, apps/web/src/state/ui/slices/panels.ts:19-22, apps/web/src/ui/panels/OrgCard.tsx:172
- **repro/reasoning:** `startRename(id)` sets `renamingOrgId`. `selectOrg(other)`, `selectOrg(null)` and `togglePanel()` (which closes the panel and nulls the selection) never clear it. Start renaming A, click B, then click A again: `OrgCard` renders `<RenameForm>` for A again with its draft reset, although the player abandoned the edit. If A dies while renaming, `reconcileViewerSelection` clears the selection but the id stays in the store.
- **fix:** Clear `renamingOrgId` in `selectOrg` whenever `id !== renamingOrgId`, and in `togglePanel` when closing.
- **confidence:** likely
- **size:** S

## BUG-30 — Desktop settings save/restart/load failures are unhandled rejections with no user feedback

- **repo:** app
- **files:** apps/web/src/ui/modals/DesktopSettingsModal.tsx:320-324, apps/web/src/ui/modals/DesktopSettingsModal.tsx:328-342, apps/web/src/ui/modals/DesktopSettingsModal.tsx:345-359, apps/web/src/ui/modals/DesktopSettingsModal.tsx:487
- **repro/reasoning:** `save()` and `restart()` are `async` handlers wired directly as `onClick={save}` / `onClick={restart}`, with `try { ... } finally { setBusy(false) }` and no `catch`. If the IPC call rejects (settings file unwritable, sim failed to restart, `applyAutoLaunch` throws), the promise rejection is unhandled. The modal gives no message, `savedAt` is never set, and in `restart()` `setStatus(null)` was already called, so the status stays blank. On open, `void desktop.settings.get().then(setSettings)` and `void desktop.sim.status().then(setStatus)` have no catch, so a rejection leaves the tab on "loading…" forever (line 487).
- **fix:** Add `catch` blocks that set a visible error (reuse `safetyMessage`, or add a `settingsError`), and add `.catch` to the two initial loads showing an error with a retry.
- **confidence:** confirmed
- **size:** S

## BUG-31 — GPU map is permanently downgraded to the 2D canvas if the first frame takes over 10 s or the tab/window is hidden at load

- **repo:** app
- **files:** apps/web/src/game/render/world-view/useRendererBackend.ts:49, apps/web/src/game/render/cf/CfWorld.tsx:76
- **repro/reasoning:** `mapReady` is only set by `onFirstDraw`, which CfWorld fires from `requestAnimationFrame(() => requestAnimationFrame(...))`. `useRendererBackend` arms an unconditional 10 s timer that calls `handleGPUFailure()` (sets `renderBackend='canvas'`, never retried) if `mapReady` is still false. Open the app in a background tab (middle-click, session restore, pinned tab) and leave it >10 s: rAF never runs while hidden, the timer fires, the GPU map is torn down and the slow 2D fallback is used for the rest of the session. Same on desktop when the window starts minimized with `rendererPaused` true, and on a slow phone where WASM boot plus atlas baking blocks the main thread for >10 s (the timer task can run before the pending rAF).
- **fix:** Start the 10 s timeout only while `!document.hidden && !rendererPaused`, restart it on `visibilitychange`/unpause, and measure from the first visible frame. Optionally lengthen it on LOW_PERF devices. Do not treat "no frame yet" as failure while a frame cannot be scheduled.
- **confidence:** confirmed
- **size:** S

## BUG-32 — Any `webglcontextlost` immediately and permanently drops to the 2D canvas although the engine restores contexts itself

- **repo:** app
- **files:** apps/web/src/game/render/world-view/useRendererBackend.ts:54-58
- **repro/reasoning:** The engine's WebGL render system registers `webglcontextlost` (calls `preventDefault()`) and `webglcontextrestored` (re-runs `initGL`, re-uploads dynamic canvases). The app adds a capture-phase `webglcontextlost` listener on the container that calls `handleGPUFailure()` at once, unmounting `<Game>` and switching to `CanvasWorldFallback` for the whole session. Context loss is routine on mobile (tab backgrounded, GPU memory pressure, driver reset), so a transient loss costs the user the fast renderer until reload.
- **fix:** On `webglcontextlost` start a grace timer (a few seconds); cancel it on `webglcontextrestored` and call `wakeRenderLoops()`/`engine.loop.markDirty()` so the map redraws. Fall back to canvas only if restore does not arrive in time or throws.
- **confidence:** likely
- **size:** M

## BUG-33 — Room/home interiors keep using xipjs after the map has already fallen back, and have no error boundary

- **repo:** app
- **files:** apps/web/src/game/render/world-view/gpu.ts:4, apps/web/src/game/scenes/home/HomeCanvas.tsx:525, apps/web/src/game/scenes/shared/RoomCanvas.tsx:178, apps/web/src/game/render/world-view/useRendererBackend.ts:26
- **repro/reasoning:** `canUseWorldGPU()` caches the first startup probe forever. `handleGPUFailure` (10 s timeout, context loss, boundary crash) only flips WorldView's local `renderBackend`; the cache still says true. Click a building after a GPU failure: `HomeCanvas`/`RoomCanvas` mount `CfRoomView` with a new `<Game>` on the same broken GPU/context, and there is no `World2DErrorBoundary` around it (only the root ErrorBoundary), so a throw takes down the whole app instead of using the existing `HomeCanvas2D`/`RoomCanvas2D`.
- **fix:** Add `markWorldGPUFailed()` to gpu.ts (sets `cached=false`), call it from `handleGPUFailure`, and wrap `CfRoomView` in an error boundary whose crash handler calls it and renders the 2D canvas.
- **confidence:** likely
- **size:** S

## BUG-34 — Returning from a home interior replays the last camera-focus request and jumps the map camera

- **repo:** app
- **files:** apps/web/src/game/render/WorldView.tsx:92-100, apps/web/src/state/camera-focus.ts:9-11, apps/web/src/App.tsx:292-299
- **repro/reasoning:** `useCameraFocus.request` is a persistent zustand value that is never cleared. WorldView is unmounted whenever a scene is open (`currentScene ? <SceneView/> : <WorldView/>` in App.tsx) and remounted on exit; its effect `if (!focusRequest) return; commandRef.current = {kind:'focus', ...}` runs on mount with the stale request. Repro: click a prayer (or press P/B, or EventRow "go to"), click a building to enter a home, press "back to map": the camera opens at the fitted view then flies to the old prayer/event tile at zoom >= 2 (the controller's first frame only applies the opening fit, the leftover command runs on the second). The effect also re-runs when `ox/oy` change, replaying the request again.
- **fix:** Consume the request: have the effect clear it after queuing (`useCameraFocus.setState({request:null})`), or track the last handled `request.n` in a module-level/ref value and ignore requests already handled; drop `ox, oy` from the deps by reading them from a ref.
- **confidence:** confirmed
- **size:** S

## BUG-35 — Pressing `?` to close the keyboard help can re-open it (two handlers toggle the same state)

- **repo:** app
- **files:** apps/web/src/ui/toolbar/HotkeyHelp.tsx:6-11, apps/web/src/App.tsx:449-450, apps/web/src/App.tsx:468, apps/web/src/App.tsx:840
- **repro/reasoning:** While the help is open, `?` is handled by HotkeyHelp's own window `keydown` listener (`onClose` -> `setHotkeysOpen(false)`) and by App's `onGameKey` (`shortcutFor` -> `help` -> `setHotkeysOpen(open => !open)`); `typingTarget` does not exclude the help because it is a bare `<div role="dialog">` and focus is on body/map, not inside it. Both state updates are queued, so the result depends on listener order: false then `!false` = open again. Order flips with React commits: HotkeyHelp's effect re-registers every App render (inline `onClose`), App's effect re-registers whenever `world` changes (every sim frame), so with the sim running `?` frequently leaves the help open (Esc still works), with the sim paused it closes.
- **fix:** Let only one owner handle `?`: remove `'?'` from HotkeyHelp (keep Escape) or make App's help action `setHotkeysOpen(true)` / skip when `hotkeysOpen`. Also memoise `onClose`.
- **confidence:** likely
- **size:** S

## BUG-36 — `+`, `=` and `-` both zoom the camera and change the brush size

- **repo:** app
- **files:** apps/web/src/game/render/cf/input/CfMapCameraController.tsx:171-178, apps/web/src/game/render/CanvasCameraController.tsx:122-128, apps/web/src/game/model/shortcuts.ts:25-26, apps/web/src/App.tsx:447-448
- **repro/reasoning:** With the map focused, the camera controller handles `+`/`=`/`-` (zoom 1.2x, `preventDefault`) while App's window listener (`shortcutFor` -> `brush`, delta +/-1) also fires for the same keydown because it only skips typing targets. One key press therefore zooms the view and resizes the brush, and the on-screen help only documents the brush meaning (`'- ='`).
- **fix:** Pick one meaning per key. Either drop the keyboard zoom for `-`/`=` (keep `+` only, or Ctrl/Meta variants) or make the brush action bail out when the map camera handled the key (`event.defaultPrevented`) / when no sandbox tool is armed. Document whichever is kept in `SHORTCUT_HELP`.
- **confidence:** confirmed
- **size:** S

## BUG-37 — Escape used to close a modal/palette/help also disarms the sandbox tool and leaves photo mode

- **repo:** app
- **files:** apps/web/src/App.tsx:509-520
- **repro/reasoning:** The global `clearTool` keydown listener reacts to every Escape with no target or `defaultPrevented` check. Arm a tool, open Stats (Radix dialog), press Esc to dismiss it: the dialog closes and the tool is silently disarmed (same from the command palette, the tribe-name input, the rename input, the native `<dialog>` tool search, the Shepherd tour). The player loses the armed tool for pressing Esc on something unrelated.
- **fix:** In `clearTool` return early when `event.defaultPrevented` or `typingTarget(event.target)`/a dialog is open, and have the modals/palette that consume Escape call `preventDefault` (CommandPalette already does).
- **confidence:** confirmed
- **size:** S

## BUG-38 — Outside-click dismissers listen for `mousedown`, which never fires for taps on the map on touch devices

- **repo:** app
- **files:** apps/web/src/ui/toolbar/AppHeader.tsx:62-70, apps/web/src/ui/panels/PrayerChip.tsx:26-34, apps/web/src/ui/modals/OrgSearchModal.tsx:55-63
- **repro/reasoning:** The More menu, the prayer list and the org-search tribe dropdown close on `document` `mousedown`. The engine cancels `touchstart` on its canvas (TouchInput `preventDefault`, see the note in game/render/cf/scenes/CfRoomView.tsx:170-172), which suppresses the emulated mouse events, and iOS Safari does not synthesise mouse events for taps on non-clickable elements at all. On a phone, open More, tap the map: the menu stays open over the map until its button is tapped again.
- **fix:** Listen for `pointerdown` instead of `mousedown` (same handler, `PointerEvent`), which fires for touch, pen and mouse regardless of touch-event cancellation.
- **confidence:** likely
- **size:** S

## BUG-39 — Follow camera centres half a tile off the drawn person and steps at sim rate while the sprite is interpolated

- **repo:** app
- **files:** apps/web/src/game/render/WorldView.tsx:115-119, apps/web/src/game/render/cf/people/people-sprites.ts:704-705, apps/web/src/game/render/cf/input/CfMapCameraController.tsx:114-118, apps/web/src/game/render/cf/input/map-click.ts:148-165
- **repro/reasoning:** People are drawn at `(x - ox) * TILE + TILE / 2` (and the focus command uses `(x - ox + 0.5) * TILE`), but `followTarget` is `{ x: (org.x - ox) * TILE, y: (org.y - oy) * TILE }`: the camera sits 4 map px up-left of the person (about 14 screen px at the follow zoom of 3.5). It also reads the raw world organism, re-applied only when React renders a new world frame, whereas the sprite is interpolated every display frame, so the followed person drifts and snaps against the screen centre between sim frames. The same missing 0.5 skews the fallback hit test `nearestOrganism` (`org.x - worldX` with `worldX = mapX / TILE + ox`), shifting its reach half a tile up-left of the drawn sprite.
- **fix:** Use `+ TILE / 2` in `followTarget`, and for smooth follow read the interpolated `px/py` the people layer already exposes through the picking registry from the camera script each frame. In `nearestOrganism` compare against `worldX - 0.5, worldY - 0.5`.
- **confidence:** confirmed
- **size:** S

## BUG-40 — Keyboard panning/zoom dies after closing the command palette (focus is not returned to the map)

- **repo:** app
- **files:** apps/web/src/ui/toolbar/CommandPalette.tsx:86-130, apps/web/src/game/render/cf/input/CfMapCameraController.tsx:156-166
- **repro/reasoning:** Ctrl/Cmd+K mounts the palette and focuses its input; the camera controller only reacts when `containerEl.contains(document.activeElement)`. Closing the palette (Esc, Enter, backdrop) unmounts the focused input so focus falls to `body` and WASD/arrows/+/-/0 do nothing until the player clicks the map again. The palette is a plain div, not a Radix dialog, so nothing restores focus.
- **fix:** Remember `document.activeElement` when opening and `.focus({preventScroll:true})` it on close (falling back to `.map2d-world`), or use a Radix Dialog wrapper that restores focus.
- **confidence:** likely
- **size:** S

## BUG-41 — Tooltip pops up and sticks after a modal closes and focus is restored to the trigger button

- **repo:** app
- **files:** apps/web/src/ui/toolbar/Tooltip.tsx:51-54
- **repro/reasoning:** `Tooltip` shows on `onFocus` and hides on `onBlur`/`mouseleave`/`click`. Header buttons (stats, civ, search, chronicles) open Radix modals; on close Radix `FocusScope` returns focus to the element focused before opening, which fires `onFocus` programmatically so the tooltip appears over the header (the mouse is elsewhere, no mouseleave will come) and stays until another element takes focus. The click handler only hides it at open time.
- **fix:** Show on focus only for keyboard-initiated focus (`e.currentTarget.matches(':focus-visible')`), or ignore `onFocus` right after a modal closes.
- **confidence:** likely
- **size:** S

## BUG-42 — Fullscreen button throws on iPhone Safari (no `requestFullscreen` on `documentElement`)

- **repo:** app
- **files:** apps/web/src/ui/toolbar/AppHeader.tsx:42-54, apps/web/src/ui/toolbar/AppHeader.tsx:241-249
- **repro/reasoning:** `toggleFullscreen` calls `document.documentElement.requestFullscreen().then(...)` unconditionally. iPhone Safari does not implement `Element.requestFullscreen`, so the call throws `TypeError: ... is not a function` synchronously, outside the `.catch`. The button is rendered on phones and just errors on every tap.
- **fix:** Feature-detect (`document.fullscreenEnabled && documentElement.requestFullscreen`, with the webkit-prefixed fallback) and hide the button when unsupported; wrap the call in try/catch.
- **confidence:** likely
- **size:** S

## BUG-43 — Deterministic / on-demand loop uses one fixed step per rAF, so the game runs 2-2.4x fast on 120/144 Hz displays

- **repo:** engine
- **files:** packages/core/src/loop/gameLoop.ts:178-181, integrations/xip/src/components/Game.tsx:318-320
- **repro/reasoning:** `<Game deterministic>` passes `fixedDt: 1/60`. `frame()` then calls `onTick(1/60)` once for every requestAnimationFrame callback, whatever the real elapsed time. On a 144 Hz monitor the simulation advances 144 x 1/60 = 2.4 s of game time per real second (physics, tweens, scripts, animation). The existing test (core/src/__tests__/gameLoop.test.ts:125) asserts the per-frame behaviour, so this is by design but wrong for realtime mode. In onDemand mode the same fixed step is intended and fine.
- **fix:** in realtime + fixedDt mode keep an accumulator: `acc += rawDt; while (acc >= fixedDt && steps++ < 5) { onTick(fixedDt); acc -= fixedDt }`, render once after the loop. Leave onDemand as is.
- **confidence:** confirmed
- **size:** M

## BUG-44 — An exception thrown inside onTick permanently stops a realtime loop

- **repo:** engine
- **files:** packages/core/src/loop/gameLoop.ts:197-201, packages/core/src/ecs/world.ts:1006-1010
- **repro/reasoning:** `frame()` calls `this.onTick(dt)` and only afterwards `requestAnimationFrame(this.frame)`. `ECSWorld.update` has no try/catch (only ScriptSystem catches, systems/scriptSystem.ts:20). A throw from the render system (e.g. a bad texture/`getContext` state), the physics system, a plugin system or the devtools buffer push escapes `frame`, the rAF chain is never re-armed and the canvas freezes with no recovery and one uncaught error in the console.
- **fix:** schedule the next rAF before calling onTick, or wrap the tick in try/finally and re-arm in finally (and optionally emit an `engine:error` event). Same for the hit-pause branch.
- **confidence:** likely
- **size:** S

## BUG-45 — First frame after start()/resume() can get a negative dt

- **repo:** engine
- **files:** packages/core/src/loop/gameLoop.ts:84, 115, 178
- **repro/reasoning:** `start()`/`resume()` set `lastTime = performance.now()`; the first rAF callback receives the frame's vsync timestamp, which in Chrome can be earlier than a `performance.now()` read made in an earlier task of the same frame. `rawDt = Math.min((time - lastTime)/1000, 0.1)` has no lower clamp, so dt can be a few ms negative. Smoothing `Math.pow(smoothing, dt*60)` > 1 makes `k` negative (camera jumps away from the target), tweens/timers run backwards, physics sees dt < 0.
- **fix:** `Math.max(0, Math.min(..., 0.1))`, or set `lastTime = -1` and use the first frame's timestamp as the baseline.
- **confidence:** likely
- **size:** S

## BUG-46 — onDemand loop is never woken by React prop changes, async image loads or canvas resizes

- **repo:** engine
- **files:** integrations/xip/src/components/Sprite.tsx:220-283 (and :114-124 image load), integrations/xip/src/components/Transform.tsx:23-33, integrations/xip/src/components/Camera2D.tsx:86-141, integrations/xip/src/components/Game.tsx:517-523 (canvas resize effect)
- **repro/reasoning:** In `mode="onDemand"` (and `<Stage>`) the only wake sources are canvas pointer/wheel/key/window-resize listeners (Game.tsx:335-343) plus TileLayer and SpriteLayer. A parent state change driven by a timer, fetch, websocket or a non-canvas button changes `<Transform x>` / `<Sprite color width>` / `<Camera2D zoom>` props; the sync effects write the ECS components but never call `engine.loop.markDirty()`, so nothing repaints until the next canvas input. A `<Sprite src>` mounted after start sets `c.image` in `.then` with no wake (shows the colour box until the next event). Changing `width`/`height` or DPR sets `canvas.width/height`, which clears the drawing buffer, and nothing re-renders, so the canvas goes blank.
- **fix:** call `engine.loop.markDirty()` at the end of each sync effect and after the image `.then` (cheap, coalesced), and after the canvas size/DPR effect in Game.tsx. Better: have `ECSWorld.addComponent`/removeComponent and these sync effects share one `engine.invalidate()` helper.
- **confidence:** likely
- **size:** M

## BUG-47 — TextLayer has no change notification, so labels never wake an onDemand loop (A4 remainder)

- **repo:** engine
- **files:** packages/renderer/src/textLayer.ts:108,282-340 (no `onChange`), integrations/xip/src/hooks/useTextLayer.ts:26-37
- **repro/reasoning:** SpriteLayer got `onChange`+`useSpriteLayer` wiring, TextLayer only bumps `version`. `names.add/setText/set/touch` in an onDemand game change nothing on screen until an unrelated event renders a frame. `useTextLayer` calls `markDirty()` once on mount only. The layout `version` is consumed only by the idle-skip hash.
- **fix:** add `onChange: (() => void) | null` to TextLayer, call it wherever `version++` happens, and set/clear it in `useTextLayer` like useSpriteLayer does.
- **confidence:** confirmed
- **size:** S

## BUG-48 — SpriteLayer additive colour (colorAdd) is decoded with `+ 0.5` in float32, so white/odd values >= 0x800000 are wrong on the GPU

- **repo:** engine
- **files:** packages/renderer/src/spriteLayerGL.ts:129-130, packages/renderer/src/spriteLayerGL.ts:517 (d[b+20] = add)
- **repro/reasoning:** `colorAdd` (0xRRGGBB, up to 16777215) is uploaded as a float attribute and decoded in the vertex shader as `ap = i_add + 0.5; floor(ap/65536), mod(floor(ap/256),256), mod(floor(ap),256)`. For values in [2^23, 2^24) float32 spacing is 1, so `x + 0.5` is a tie that rounds to even: odd values become x+1, and 0xFFFFFF becomes 16777216, which decodes to (256/255, 0, 0): a full-white additive flash renders pure red; 0xFF00FF (0xFF in the blue byte with red >= 0x80) wraps blue to 0 and carries into green. Values with red < 0x80 are exact. (Rounding mode is GPU dependent, hence "likely".)
- **fix:** drop the `+ 0.5` (the attribute is an exact integer < 2^24, `floor`/`mod` are then exact), or pass the three channels as a normalized UNSIGNED_BYTE attribute instead.
- **confidence:** likely
- **size:** S

## BUG-49 — 'multiply' blend func is wrong for any alpha < 1 or non-black transparent texels

- **repo:** engine
- **files:** packages/renderer/src/blendModes.ts:14-16, packages/renderer/src/webglRenderSystem.ts:2102-2104
- **repro/reasoning:** sprites, SpriteLayer and TileLayer output straight-alpha colour and use `blendFunc(DST_COLOR, ONE_MINUS_SRC_ALPHA)`, i.e. result = dst*src.rgb + dst*(1-a) = dst*(src.rgb + 1 - a). Correct multiply is dst*(1 - a + a*src.rgb). They only agree at a = 1 or src = 0. A white multiply layer with `opacity 0.5` gives 1.5 x dst (brightens); texels with a = 0 but rgb = white (common in PNG exports) give 2 x dst, so a halo around every multiply sprite. The screen-tint path already does this correctly (`drawTint`, webglRenderSystem.ts:2519-2526 folds alpha into the colour and uses DST_COLOR, ZERO).
- **fix:** for 'multiply' output `mix(vec3(1), rgb, a)` with alpha 1 in the shader (needs a uniform/flag) and blend `DST_COLOR, ZERO`; or use `blendFuncSeparate` after pre-multiplying. Apply to sprite, SpriteLayer, tile shaders and `applyBlendMode`.
- **confidence:** likely
- **size:** M

## BUG-50 — A NaN/Infinity follow target poisons the camera permanently (smoothing or dead zone)

- **repo:** engine
- **files:** packages/renderer/src/webglRenderSystem.ts:2757-2800, packages/renderer/src/frameSim.ts:60-110
- **repro/reasoning:** `followEntity` reads `t.x/t.y` from the Transform with no finite check (followPoint/followSprite are checked in cameraFollow.ts). If the target's transform is ever NaN (physics blow-up, 0/0 in a script) then with `smoothing > 0` `cam.x += (NaN - cam.x) * k` and with a dead zone every comparison is false: `cam.x` becomes NaN and stays NaN even after the target recovers, because `tx - NaN` is NaN. The whole world disappears for the rest of the session. Only `smoothing = 0` self-heals.
- **fix:** `if (!Number.isFinite(tx) || !Number.isFinite(ty)) hasTarget = false`, and reset `cam.x/y` to 0 (or last good) if they are not finite before use. Same in frameSim.ts (Canvas2D path). Also guard `cam.zoom <= 0 || !isFinite(zoom)`.
- **confidence:** confirmed
- **size:** S

## BUG-51 — WebGLRenderSystem.dispose() leaks GL objects on a canvas that is reused (remount, StrictMode, HMR)

- **repo:** engine
- **files:** packages/renderer/src/webglRenderSystem.ts:1701-1737 (dispose), :1479-1513 (`_ensurePPFBOs`), :1451-1478 (`_ensurePPPrograms`), :2570-2590 (`_layerImageTextures`), :1752 (`quadBuf`), :1913-1920 and :2270-2279 (image `onload`)
- **repro/reasoning:** dispose() deletes sprite/shape/parallax textures, programs, VAOs and the instance buffer, but not: the post-process scene/bloom/blur FBOs + textures (`_ppSceneFBO/_ppSceneTex/_ppBloomExtract*/_ppBlurFBO1/2/_ppBlurTex1/2`), the three post-process programs, the static `quadBuf`/fullscreen buffers, and every texture in `_layerImageTextures` (a WeakMap that cannot be iterated, so SpriteLayer `image` atlases always leak). The comment on dispose says "The canvas can be reused afterwards": `getContext('webgl2')` then returns the same context, so each Game remount (StrictMode double effect, key change, HMR, canvasGen fallback) accumulates full-screen FBOs and atlases until page unload. Also, `img.onload` of a texture that was still loading at dispose time calls `gl.createTexture()` on the disposed renderer and stores it in `this.textures`, which nothing ever frees.
- **fix:** delete the PP resources and programs in dispose(); track layer-image textures in a Map (or a Set next to the WeakMap) so they can be freed; keep a `_disposed` flag checked at the top of every `onload` and bail out; delete the static buffers.
- **confidence:** confirmed
- **size:** M

## BUG-52 — A sprite/SpriteLayer image that fails to load is re-requested on every frame

- **repo:** engine
- **files:** packages/renderer/src/webglRenderSystem.ts:1868-1930 (`loadTexture`, onerror at :1921-1924), :2608-2612 (`resolveLayerAtlas` calls it every frame)
- **repro/reasoning:** on `img.onerror` the entry is deleted from `imageCache` (`this.imageCache.delete(imgSrc)`) so the next `loadTexture(src)` creates a new `Image` again. A SpriteLayer atlas with a 404 `src` calls `loadTexture` each frame, so you get one network request and one console.warn per frame, forever (also keeps the main thread busy with failed loads).
- **fix:** keep a `failed` Set (or store the errored `Image` and a retry-after timestamp) and return `whiteTexture` without re-fetching; retry only after e.g. 5 s or on an explicit API call.
- **confidence:** confirmed
- **size:** S

## BUG-53 — Mouse.dx / dy only keep the last mousemove's delta, not the per-frame sum

- **repo:** engine
- **files:** packages/input/src/mouse.ts:21-26, :87-88
- **repro/reasoning:** `onMouseMove` does `this.dx = e.clientX - rect.left - this.x` (assignment) and flush() zeroes it once per frame. Browsers deliver several mousemove events per frame (1000 Hz mice, 60 fps loop = about 16 per frame), so `mouse.dx/dy` report one sub-step of the motion and under-report drag / mouse-look speed by up to the event rate ratio.
- **fix:** `this.dx += newX - this.x` (and dy); keep `x/y` as the latest position.
- **confidence:** confirmed
- **size:** S

## BUG-54 — GamepadInput.getStick() flips Y the wrong way, and stale stick/trigger values survive a disconnect

- **repo:** engine
- **files:** packages/input/src/gamepad.ts:251-261, :174-183, packages/input/src/__tests__/gamepad.test.ts:75-82, packages/input/src/inputMap.ts:95
- **repro/reasoning:** W3C standard mapping already has axes[1/3] = -1 up, +1 down (screen convention). `getStick` negates Y (`if (axis === 'y') v = -v`), so pushing the stick UP returns +1, contradicting its own doc ("+y is DOWN") and the digital codes (`gamepad:LY+` is active for raw > 0 = down). `InputMap` stick axes therefore invert against keyboard ArrowDown = +1. The test comment "browser -1(up) -> +1(down)" encodes the mistake. Separately, when a pad disappears, flush() clears `held` but not `axes`/`triggers`, and adds no `justReleased` edges, so `getStick`/`getTrigger` keep returning the last value (e.g. a stuck 1.0) after unplug.
- **fix:** remove the Y negation (and fix the test/doc; note it is a behaviour change), zero `axes`/`triggers` and emit release edges for held ids in the disconnect branch.
- **confidence:** confirmed
- **size:** S

## BUG-55 — Keyboard aliases by e.key get stuck or fire phantom presses when Shift/modifiers change during a hold

- **repo:** engine
- **files:** packages/input/src/keyboard.ts:7-26
- **repro/reasoning:** every key is tracked both by `e.code` and `e.key`. Hold `a` (adds `KeyA`, `a`), press Shift: auto-repeat keydown now has `e.key === 'A'`, which adds a new held `A` and a phantom `isPressed('A')`. Release `a` while Shift is down: keyup has key `A`, so `a` (the entry from the original press) is never deleted: `isDown('a')` stays true until blur. Same in reverse (press Shift+a, release Shift, release a). Any game binding on `e.key` names (not `code`) can stick.
- **fix:** on keyup also delete the lower/upper-case counterpart, or track key->code per physical `code` (map code -> key at keydown and release exactly that key at keyup).
- **confidence:** confirmed
- **size:** S

## BUG-56 — Pointer coordinates are wrong whenever `<Game scale="contain">` scales the canvas with a CSS transform

- **repo:** engine
- **files:** integrations/xip/src/components/Game.tsx:436-441, packages/input/src/mouse.ts:21, packages/input/src/touch.ts:32,54,69, integrations/xip/src/hooks/useCameraPanZoom.ts:78, integrations/xip/src/hooks/useDragDrop.ts:126,164, integrations/xip/src/hooks/useHoverable.ts:65
- **repro/reasoning:** contain mode does `canvas.style.transform = scale(s)`. `getBoundingClientRect()` returns the scaled rect, and all these code paths use `clientX - rect.left` as CSS-pixel canvas coordinates while the camera math uses `canvas.clientWidth` (unscaled). With s != 1 mouse/touch/drag/hover/tap positions are off by a factor of s, so picking and drag handles miss.
- **fix:** add one helper `canvasPoint(canvas, clientX, clientY)` that multiplies by `canvas.clientWidth / rect.width` (and height) and use it everywhere (Mouse, TouchInput, the hooks, A11yNode/FocusRing/EditableText/VectorPath/TransformHandles which also use getBoundingClientRect).
- **confidence:** confirmed
- **size:** M

## BUG-57 — pointercancel is handled like pointerup: a cancelled touch fires onTap / onDrop

- **repo:** engine
- **files:** integrations/xip/src/hooks/useCameraPanZoom.ts:172-215 (+243), integrations/xip/src/hooks/useDragDrop.ts:146-168 (+214) and :328-340
- **repro/reasoning:** `pointercancel` is bound to the same handler as `pointerup`. When the browser takes over a touch (scroll, system gesture, palm rejection), `useCameraPanZoom` still calls `onTap` with the stale position (an accidental selection), `useDraggable` runs `findDroppableUnder` and reports `onDragEnd({ droppedOn })`, and `useDroppable` fires `onDrop`.
- **fix:** separate cancel handlers: cancel the gesture, release capture, no tap / drop callbacks (optionally `onDragCancel`).
- **confidence:** confirmed
- **size:** S

## BUG-58 — useHoverable re-subscribes on every render and resets its `hovered` flag; hit box ignores anchor/offset

- **repo:** engine
- **files:** integrations/xip/src/hooks/useHoverable.ts:57-113
- **repro/reasoning:** the effect depends on `options`; callers pass inline objects (`useHoverable({ onEnter })`), so every render removes/adds the listeners and re-initialises `let hovered = false` (also no onLeave for the pointer that was inside). After any re-render (including the `setIsHovered(true)` it triggers) the next pointermove inside fires `onEnter` again; with an onEnter that sets state this re-fires continuously. The bounds test also assumes the entity is centred (`Math.abs(localX) <= halfW`), ignoring Sprite `anchorX/anchorY` and `offsetX/Y`.
- **fix:** keep options in a ref (as useDraggable does), key the effect on `[engine, entityId, disabled]`, and offset the local point by the sprite anchor/offset.
- **confidence:** likely
- **size:** S

## BUG-59 — VirtualJoystick leaves the global virtual axis / button pressed after unmount or lost pointer

- **repo:** engine
- **files:** integrations/xip/src/components/VirtualJoystick.tsx:60-80, :150-170, integrations/xip/src/hooks/useVirtualInput.ts:3-14
- **repro/reasoning:** the axis and buttons live in module-level objects. If the joystick (or the action button) unmounts while a finger is down (scene change, conditional render), no cleanup runs, so `useVirtualInput().axisX/axisY` and `button('action')` stay non-zero and the player keeps walking/jumping. The action button also has no `lostpointercapture` handling, and pointer capture is not released.
- **fix:** `useEffect(() => () => { setVirtualAxis(0, 0); setVirtualButton(actionName, false) }, [actionName])` and handle `onLostPointerCapture` the same as pointerup.
- **confidence:** confirmed
- **size:** S

## BUG-60 — Global key handlers ignore text fields: Ctrl+Z is hijacked, and typing in an overlay input drives the game

- **repo:** engine
- **files:** integrations/xip/src/hooks/useHistory.ts:111-124, packages/input/src/keyboard.ts:7-31, integrations/xip/src/components/EditableText.tsx:178-191
- **repro/reasoning:** `useHistory({ bindKeys })` adds a window keydown handler that calls `preventDefault()` for Ctrl/Cmd+Z/Y with no target check, so undo inside any `<input>`/`<textarea>` (including the engine's own EditableText) is replaced by the game undo. `Keyboard` also listens on `window` with no filtering, and EditableText does not stop native propagation, so typing `w`, `a`, space in the overlay input sets those keys held in `InputManager`.
- **fix:** reuse the guard already in useKeyboardFocus.ts:143-146 (ignore INPUT/TEXTAREA/contentEditable targets) in useHistory and in Keyboard (do not record keys while the target is an editable element).
- **confidence:** confirmed
- **size:** S

## BUG-61 — AssetManager.loadAudio never stores the in-flight promise: duplicate fetch/decode and inflated progress totals

- **repo:** engine
- **files:** packages/core/src/assets/assetManager.ts:115-142
- **repro/reasoning:** the code checks `this.audioPromises.has(resolved)` (:119) and deletes from it in `finally` (:138) but never calls `audioPromises.set(resolved, promise)`. Two concurrent `loadAudio('/a.ogg')` calls (e.g. two components, `preloadAudio` plus a hook) each fetch and decode the file and each increment `_total`, so progress percent is wrong and bandwidth is doubled. (Images do set the promise, :80-100.)
- **fix:** `this.audioPromises.set(resolved, promise)` right after creating it.
- **confidence:** confirmed
- **size:** S

## BUG-62 — duck() and setGroupVolumeFaded() ignore mute: a muted group becomes audible again

- **repo:** engine
- **files:** packages/audio/src/audioContext.ts:274-285, :340-352
- **repro/reasoning:** `setGroupMute('music', true)` sets the node gain to 0 and keeps `groupVolumes` unchanged. `duck('music', 0.3, 2)` then ramps that node to 0.3 and finally back to `prev = groupVolumes.get(group)` (e.g. 1), so a dialogue duck or a fade un-mutes music. `setGroupVolumeFaded` ramps a muted node to `volume` immediately for the same reason. `isGroupMuted` still returns true while it is audible.
- **fix:** in both functions, if `groupMuted.get(group)` only update `groupVolumes` and return (and make the duck restore target 0 when muted at restore time).
- **confidence:** confirmed
- **size:** S

## BUG-63 — useSound.crossfadeTo keeps playing (and leaks a buffer ref) if the component unmounted while the new file loads

- **repo:** engine
- **files:** packages/audio/src/useSound.ts:372-396
- **repro/reasoning:** the `loadBuffer(newSrc).then(...)` callback has no cancelled/unmounted check. If the hook's component unmounts before the load resolves, the effect cleanup (:131-158) already ran, then the callback spawns a looping source, pushes it to the dead `activeInstances` and sets `acquiredSrcRef`; nothing can stop it (only `stopGroup`), and the buffer refcount is never released.
- **fix:** capture a per-effect `cancelled` flag in a ref and in `.then` release the buffer and return when unmounted (unless `persistent`).
- **confidence:** likely
- **size:** S

## BUG-64 — WebRTC transport reports 'disconnected' but never reports the recovery, so Room stays offline

- **repo:** engine
- **files:** packages/net/src/webrtcTransport.ts:125-129, :173-176, packages/net/src/room.ts:57-72
- **repro/reasoning:** `connectionstatechange` fires disconnect handlers for 'disconnected', but 'disconnected' is a transient ICE state that commonly returns to 'connected' without the data channel closing. Connect handlers only fire on the channel's 'open' event, so `Room._connected` is set false and cleared peers are never restored: `room.isConnected` stays false, `useNetworkInput` and `syncEntity` (which gate on it) stop broadcasting for the rest of the session. Disconnect handlers also fire up to three times for one drop (disconnected, failed, channel close).
- **fix:** on `connectionstatechange === 'connected'` call the connect handlers again (once per transition), and de-duplicate disconnect notifications with a `connected` boolean.
- **confidence:** likely
- **size:** S

## BUG-65 — syncEntity: late joiners / reconnects never get unchanged components, and an owner restart freezes receivers

- **repo:** engine
- **files:** packages/net/src/syncEntity.ts:43-76 and :96-104, packages/net/src/room.ts:98 (`_seq`)
- **repro/reasoning:** (a) the owner sends only components whose JSON differs from `lastSent`; `lastSent` is only cleared by stop(). A peer that joins later, or any peer after a transport reconnect, never receives a component that has not changed since, so a stationary entity stays at its default state there. (b) the receiver drops every message with `seq <= lastAppliedSeq`, but `seq` comes from the sender's Room counter which restarts at 0 when the owner reloads or recreates its Room (new tab, reconnect with a new Room); the receiver's `lastAppliedSeq` is still high, so all state from that owner is ignored until it catches up.
- **fix:** reset `lastSent` on `room.onPeerJoin` and when `isConnected` flips back to true (send a full snapshot); on the receiver reset `lastAppliedSeq` when the sender's peer:leave/join is seen or when seq decreases by a large margin.
- **confidence:** likely
- **size:** M

## BUG-66 — SpriteLayer.resize() promises zeroed new slots but exposes stale x/y/w/h from earlier sprites

- **repo:** engine
- **files:** packages/renderer/src/spriteLayer.ts:433-449 (resize/reset)
- **repro/reasoning:** `resize(n)` ("new slots are zeroed, white, visible") calls `reset(i, i)` which resets frame, atlas, colour, flags, ids, sortKey, hit, anchor, colorAdd, sway but not `x/y/w/h`. After `clear()` / `removeAt()` / shrinking `resize()`, growing again reuses the old slot contents, so new sprites appear at their previous positions and sizes (visible ghosts of removed sprites) instead of at 0,0 with size 0.
- **fix:** zero `x/y/w/h` for each new slot in `resize` (`reset` is also used by `add`, which overwrites them, so it is safe to zero there).
- **confidence:** confirmed
- **size:** S

## BUG-67 — markAtlasDirty() does not invalidate alpha-pick masks, and `pixelSource` stays bound to the first renderer

- **repo:** engine
- **files:** packages/renderer/src/spriteLayer.ts:540-548 (markAtlasDirty), :769-780 (`maskOf`, cached per atlas/source), :742 (`invalidateHitMasks`), packages/renderer/src/webglRenderSystem.ts:1294-1299
- **repro/reasoning:** after repainting a canvas `image` and calling `layer.markAtlasDirty(i)` (the A5 fix) the GPU texture updates, but `maskOf` caches the alpha mask under the same canvas object (`m.source === src`), so `pickIndex` with `alpha`/`hit: 'opaque'` keeps testing the old pixels until the app also calls `invalidateHitMasks()`, which is not mentioned in markAtlasDirty's doc. Also `layer.pixelSource ??= ...` only binds on the first `addSpriteLayer`; a layer reused with a second render system (remount keeping the same SpriteLayer) keeps resolving dynamic canvases / images through the disposed renderer's maps.
- **fix:** in markAtlasDirty, delete that atlas' entry from `_masks`; assign `pixelSource` unconditionally in `addSpriteLayer` (and clear it in `removeSpriteLayer`).
- **confidence:** likely
- **size:** S

## BUG-68 — Flaky test: rendererFallback "'auto' falls back to Canvas2D ... warning once across mounts"

- **repo:** engine
- **files:** integrations/xip/src/__tests__/rendererFallback.test.tsx:79-88 (mount helper), :122-134
- **repro/reasoning:** failed once in the full parallel `pnpm test` (`engineRef` null at :133, TypeError reading `renderBackend`), passes 3/3 when run alone. `mount()` waits a fixed `setTimeout(20)` for the lazy `import('./canvas2dBackend')` (Game.tsx:225-230) to resolve and re-run the engine effect; under a loaded CI/CPU the dynamic import takes longer.
- **fix:** replace the fixed delay with `await waitFor(() => expect(engineRef).not.toBeNull())` (or `vi.waitFor`), with a generous timeout.
- **confidence:** confirmed
- **size:** S
