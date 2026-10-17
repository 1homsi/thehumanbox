# Desktop bugs, round 2 (research sub-agent, 2026-10-16)

Scope: `apps/desktop/main`, `apps/desktop/preload`, and desktop-only paths in `apps/web` (`App.tsx`, `shared/config.ts`, `shared/desktop*.ts`). Read against `origin/main` at `1dd0a0c2`, desktop version `0.5.86`.

Excluded on purpose: BUG-06..19 and BUG-30 from `bugs.md`, and anything already fixed by the merged PRs (#593..#660 that touch desktop). Each finding below was read end to end. Items marked **verify** depend on Electron or Node runtime behavior that the repo cannot show; the docs check is noted where it was done.

Ranked most severe first.

## DSK-01 Windows: the simulation child opens a visible console window, and closing it kills the sim

- **Severity:** High (Windows users see it on every launch)
- **file:** `apps/desktop/main/sim-process.ts:503-507` (`spawn(bin, [], {cwd, env, stdio})`, no `windowsHide`); `apps/server` has no `#![windows_subsystem = "windows"]` anywhere, so `simulation-rs.exe` is a console-subsystem binary.
- **Repro:** Packaged build on Windows, launch the app. A black console window titled `simulation-rs.exe` appears next to the app. Close it. The sim is terminated, the child exit handler runs `onUnexpectedSimExit`, and "The simulation stopped unexpectedly" appears.
- **Why:** Node's `child_process.spawn` creates a console for console-subsystem children unless `windowsHide: true` is passed. The sibling helpers in the same codebase (`sim-process.ts:127` for `tasklist`, `data-lock.ts:145` for PowerShell) already pass `windowsHide: true`; the sim spawn does not. The doc check for Node's default could not be confirmed from a primary source in this session, but the Node docs list the default as `false`.
- **Suggested fix:** Pass `windowsHide: true` in the `spawn` options. Also add `#![windows_subsystem = "windows"]` to the server binary's `main.rs` only if stdout/stderr are not needed in that build; otherwise keep the piped stdio and rely on `windowsHide`.
- **Regression test:** Unit test on a pure helper `buildSimSpawnOptions(platform)` that returns `windowsHide: true` on `win32`. Add it to `sim-env.test.ts` or a new `sim-spawn.test.ts` and assert the spawn options contain it. Manual check on Windows: no console window.

## DSK-02 Packaged builds have no tray icon and no window icon: `build/icon.png` is not inside `app.asar`

- **Severity:** High on Windows/Linux when "Start minimized" is on (the window stays hidden with no tray icon, so there is no visible way back); Medium otherwise.
- **file:** `apps/desktop/main/index.ts:184` (`BrowserWindow.icon`), `apps/desktop/main/index.ts:441` (`buildTray`), `apps/desktop/electron-builder.yml:9-12` (`files` allowlist is `dist/**/*`, `package.json`, minus `*.ts|map|md`; `build/` is not listed).
- **Repro:** `pnpm run pack` on Windows, install, enable "Start minimized" and "Launch at login", reboot. The window stays hidden. No tray icon appears (`new Tray(emptyImage)`). Relaunching from the Start menu shows the "couldn't start the local simulation" error page (see DSK-04). Also: the window and taskbar icon are blank.
- **Why:** The path resolves to `app.asar/build/icon.png`. That file is not packaged, so `nativeImage.createFromPath` returns an empty image. The Electron docs confirm that `createFromPath` returns an empty image, rather than throwing, when the path does not exist. `buildTray` only catches thrown errors, so the empty tray is silently created. Then `boot()` at `index.ts:790` checks `if (!tray && ...)` to decide whether to reveal the window. `tray` is non-null, so the window stays hidden.
- **Suggested fix:** Add `build/icon.png`, `build/icon.ico`, `build/icon.icns` to `electron-builder.yml` `extraResources` (to a stable location), or copy the file into `dist/` in `copy:renderer`, and resolve paths via `app.getAppPath()`. Also make `buildTray` fail loudly when `img.isEmpty()`, so `boot()` reveals the window in that case.
- **Regression test:** A packaging check that runs `asar list` on the packed `app.asar` and asserts `build/icon.png` is present (script in `scripts/`, run from `pack`). Unit test for `buildTray` helper: when the icon is empty, `revealWindow` runs.
- **Verify:** `npx @electron/asar list` on a packed build. I did not build the installer in this session.

## DSK-03 Quitting while the sim is still starting leaves `simulation-rs` running after the app exits

- **Severity:** High (the sim process outlives the app, uncontrolled, until the next launch)
- **file:** `apps/desktop/main/index.ts:884-893` (`before-quit` gates on `activeSim()` only); `apps/desktop/main/sim-process.ts:359` (`process.on("exit", signalCurrent)` signals only `current`); `sim-process.ts:368-392` (`startInFlight` is not `current`); `sim-process.ts:676-687` (`stopSimOnce` awaits `startInFlight`, but nothing calls it on quit).
- **Repro:** Open a world whose save takes 10+ seconds to load. While "loading" (before the window or sim has bound), press Cmd+Q (or Alt+F4 / tray Quit). Check `ps` or Task Manager: `simulation-rs` is still alive after the app exits. `sim.pid` is still present. The orphan keeps saving and ticking until the next app launch reaps it through `killOrphanFromPidFile`.
- **Why:** `before-quit` returns early when `activeSim()` is null, which is the case throughout `startSim`. `stopSim` already waits on `startInFlight` correctly, so the only gap is that `before-quit` never calls it. The `exit` handler only signals `current`. The Rust sim has no parent-death watchdog: `THB_DESKTOP_PARENT_PID` is only used for the lock claim (`apps/server/src/desktop_lock.rs:113`), so the sim does not exit when its parent disappears. The same gap applies to SIGKILL or a crash of Electron, but the startup path is the one where the app's own shutdown is the cause.
- **Suggested fix:** In `before-quit`, also intercept when `startInFlight` is set (add an exported `simLifecyclePending()` that checks `current || startInFlight`), then call `shutdownThenQuit`, which calls `stopSim`. Better: make `stopSimOnce` kill the in-flight child directly (record `pendingChild` in `startSimOnce` before `waitForSimulation`) so quit does not wait up to 60 s for the load. Also add a parent-death watchdog in `apps/server` that exits when `THB_DESKTOP_PARENT_PID` is no longer alive (poll every second).
- **Regression test:** `sim-process` test with a fake spawn: start `startSim`, call the quit gate while `waitForSimulation` is pending, assert the child receives SIGTERM and `activeSim()` returns null afterwards. Rust test for the watchdog: spawn the binary with a dead parent PID and assert it exits within 3 s.

## DSK-04 No single-instance lock: a second launch shows a startup error instead of focusing the running app

- **Severity:** Medium (confusing error, duplicate tray icon, duplicate update prompts; data is safe)
- **file:** `apps/desktop/main/index.ts` (no `app.requestSingleInstanceLock()`; grep for it returns nothing under `apps/desktop`); `sim-process.ts:449` (`acquireDataRootLock(workdir, process.pid, true)`); `data-lock.ts:262-271` (throws "this save folder is already open by another The Human Box process").
- **Repro:** Launch the app (window minimized or in tray). Launch it again from the Start menu or `open -n`. The second instance shows the "The Human Box couldn't start the local simulation: this save folder is already open ... (pid N)" page in a new window, and adds a second tray icon. `initUpdater` also runs in the second instance, so its update dialogs can show twice. The first instance is not focused.
- **Why:** The second process passes through `startSim` → `acquireDataRootLock`, which correctly refuses the lock (the owner is alive and `pidWasRecycled` returns false because the executable name matches). The refusal is correct for data safety, but it is reported as a startup failure instead of a focus request. The `globalShortcut.register` in `boot()` also fails in the second instance, which is only logged.
- **Suggested fix:** Call `app.requestSingleInstanceLock()` at the top of `index.ts`; if it returns false, `app.quit()` immediately. In the first instance, handle `app.on('second-instance', ...)` by calling `revealWindow`/`toggleWindow` on `mainWindow` (or `createWindow` when there is no window). Keep the data-lock refusal as the backstop.
- **Regression test:** Unit test that exercises the boot wiring with a stubbed `app` whose `requestSingleInstanceLock` returns false, asserting no `createWindow` or `startSim` call. Add to `startup-wiring.test.ts`.

## DSK-05 The window is not created until the whole world has loaded: no first paint, no menu, tray, shortcut or updater for up to 60 s

- **Severity:** Medium (startup UX and time-to-first-paint, directly on the "what runs before first paint" question)
- **file:** `apps/desktop/main/index.ts:159-169` (`await startSim(settings)` before the window exists); `index.ts:174` (`new BrowserWindow`); `index.ts:308` and `index.ts:310` (`loadFile` only after sim is ready); `index.ts:786-792` (`buildMenu`, `buildTray`, `initUpdater`, `globalShortcut` all run after `await createWindow()`, which also awaits `loadFile`); `sim-ready.ts:12` (`SIM_START_TIMEOUT_MS = 60_000`).
- **Repro:** Use a large save (the sim's own load takes several seconds). Launch. The dock/taskbar shows the app with no window for the whole sim load. The custom menu (and its Restart/Settings items) and the tray icon do not exist until the sim binds and the renderer finishes loading. Measure with `time` to first `did-finish-load`.
- **Why:** The renderer needs `api` and `token` in its URL at load time (`shared/config.ts` reads them at module init), which is why the window waits for the sim. The renderer already has a splash (`thb-world-ready`), so a window with the splash could be shown first and then navigated to the query-bearing URL once the sim is ready (the same mechanism `loadLocalRenderer` uses for `sim:restart`). Until then, the Electron default menu is what the user sees.
- **Suggested fix:** Create the `BrowserWindow` and show it before `startSim`, loading the renderer with `desktop=1` and no `api`/`token` (splash state), then call `loadLocalRenderer` (already exists in `ipc.ts`) once the sim is ready. Move `buildMenu`/`buildTray`/`initUpdater`/shortcut registration ahead of the sim wait. Keep the boot-error path for sim failure.
- **Regression test:** `startup-wiring.test.ts`: assert that `BrowserWindow` construction happens before `startSim` is awaited (inject a fake `startSim` that never resolves and check the window was created). Renderer test: splash state shown when `api` is absent in desktop mode.

## DSK-06 Duplicate windows: `createWindow` has no in-flight guard, so repeated dock clicks or hotkey presses during startup open several windows

- **Severity:** Medium
- **file:** `apps/desktop/main/index.ts:540-544` (`toggleWindow`: `if (!mainWindow) { void createWindow(); }`); `index.ts:895-897` (`activate`: `getAllWindows().length === 0` → `createWindow`); `index.ts:200` (`mainWindow = win` only after `await startSim` at line 161).
- **Repro:** On macOS, close the window (which stops the sim per `window-all-closed`), then click the dock icon twice within the sim load time. Or press Cmd+Alt+Shift+H twice. Two BrowserWindows open, both loading the same sim. `mainWindow` tracks only the second. Then choose File → Restart simulation: only the tracked window is closed (`createWindowReplace` closes `old = mainWindow`), and the untracked window keeps the pre-restart API port and token, so its map freezes.
- **Why:** `mainWindow` is assigned after `startSim` resolves. During that await, `mainWindow` is null and `getAllWindows()` is empty, so every trigger (`activate`, tray click, hotkey, notification click) creates another window. `startSim` coalesces the sim start via `startInFlight`, so both windows get the same sim.
- **Suggested fix:** Keep a single `windowCreation: Promise<void> | null` in `index.ts`. `createWindow` entry points (`toggleWindow`, `activate`, notification click) should reuse it when set. Alternatively, with DSK-05 applied, create the window synchronously before `startSim`, which removes the window of vulnerability.
- **Regression test:** Call `toggleWindow()` twice with a stubbed `startSim` that resolves later; assert `new BrowserWindow` is called once.

## DSK-07 Unhandled promise rejections in the main process reach the `uncaughtException` handler, which quits the app and stops the sim

- **Severity:** Medium (robustness; a single rejected fire-and-forget promise takes down the app). **Verify** at runtime: whether Electron's main process routes unhandled rejections to `uncaughtException` (Node 15+ default `--unhandled-rejections=throw`).
- **file:** `apps/desktop/main/sim-process.ts:362-365` (`process.on("uncaughtException", ... stopAndExit(1))`); `index.ts:542` (`void createWindow()`, no catch); `index.ts:895-902` (`app.on("activate", async ...)` with `await createWindow()`, no catch); `index.ts:793` (`onUnexpectedSimExit(({code, signal}) => void offerSimRestart(code, signal))`, no catch around `withErrorDialog`).
- **Repro:** Make `win.loadFile` reject while the window is being created from the tray or dock. For example, close the new window while it is still loading (Electron rejects with `ERR_ABORTED`), or remove `renderer/index.html` from the install. `createWindow` rejects, the unhandled rejection goes to `uncaughtException`, and the app quits with the sim stopped (`stopAndExit(1)`).
- **Why:** The `boot()` path has a deliberate `startWhenReady(..., reportStartupFailure)` catch, but the later entry points do not. `createWindow` awaits `loadFile`/`loadURL`, which reject on load failure and on superseded loads. `uncaughtException` is wired to hard-quit.
- **Suggested fix:** Route every fire-and-forget entry point through one helper (for example `runSafely(label, fn)`) that logs and shows a non-fatal error dialog, and reserve `uncaughtException` for truly unrecoverable state. Add `.catch` to `void createWindow()`, to the `activate` handler body, and to `offerSimRestart`.
- **Regression test:** Unit test that stubs `createWindow` to reject, calls `toggleWindow()`, and asserts the process does not call `process.exit` / `stopSim` and logs the failure.

## DSK-08 macOS: File → Restart simulation is a silent no-op when no window is open

- **Severity:** Low-Medium
- **file:** `apps/desktop/main/index.ts:641-648` (`restartSimulation`: `await stopSim(...)` then `if (mainWindow) await createWindowReplace()`); `index.ts:874-881` (`window-all-closed` stops the sim on macOS while the app stays in the dock); `index.ts:312-314` (`win.on("closed")`) sets `mainWindow = null`.
- **Repro:** macOS: close the only window (sim stops, app stays in dock). Use File → Restart simulation. Nothing happens: no window, no sim, no error. The menu bar item is still there.
- **Why:** `restartSimulation` stops the sim and only restarts when a window exists. When there is no window, the sim is already stopped, so the restart does nothing and the user gets no feedback.
- **Suggested fix:** Replace the `if (mainWindow)` guard with `await createWindow()`-equivalent logic (`createWindowReplace` already handles a null `old`). Or make the menu item disabled when no window exists.
- **Regression test:** `restart-recovery.test.ts` or a new `restart-menu.test.ts`: with `mainWindow` null and no sim, `restartSimulation()` leaves a running sim.

## DSK-09 Clicking a desktop notification hides a visible window

- **Severity:** Low
- **file:** `apps/desktop/main/index.ts:557-562` (`notifyMilestone`: `n.on("click", () => toggleWindow())`); `index.ts:540-555` (`toggleWindow` hides a visible window).
- **Repro:** The game window is visible but behind another app. A headline or screenshot notification arrives (the renderer sends `app:notify` when `desktopWindowInactiveRef` or the document is hidden). Click the notification. The window hides instead of coming to the front.
- **Why:** `notifyMilestone` reuses `toggleWindow`, which is a tray/hotkey toggle. A notification click should reveal and focus the window, not toggle it.
- **Suggested fix:** On notification click call `revealWindow(mainWindow)` (or `createWindow` when null), not `toggleWindow`.
- **Regression test:** Unit test with a visible stub window: notification click calls `show`/`focus` and does not call `hide`.

## DSK-10 A hidden launch shows a notification for an old chronicle headline

- **Severity:** Low (every "start minimized" login shows a stale notification)
- **file:** `apps/web/src/App.tsx:599` (`lastHeadlineTickRef = useRef<number>(0)`); `App.tsx:601-612` (effect notifies for `newest` when `visibilityState !== 'visible'` or the window is inactive).
- **Repro:** Enable "Start minimized" and launch at login. The first world frame arrives with `world.headlines` holding up to 80 past headlines. `newest.tick` (for example 40,000) is greater than the ref's initial 0, and the window is hidden, so `desk.app.notify` fires for the saved world's last headline.
- **Why:** The ref starts at 0, so every already-existing headline counts as new on first load. It is only correct once the ref has been seeded from the first world.
- **Suggested fix:** On the first world (when the ref is still at its initial value), seed `lastHeadlineTickRef.current = newest.tick` and return without notifying.
- **Regression test:** Renderer unit test: first world with headlines and an inactive window → no `app.notify` call; a later headline with a higher tick → one call.

## DSK-11 "Update ready" prompt is raised again by every 6-hour check and every manual check while the update is still downloaded

- **Severity:** Low
- **file:** `apps/desktop/main/updater.ts:76-98` (`update-downloaded` handler, unguarded `dialog.showMessageBox`); `updater.ts:118-123` (6-hour interval calls `checkForUpdatesNow`); `updater.ts:127-136` (`checkForUpdatesNow` resets status to `checking`).
- **Repro:** Download an update, click "Later". After 6 hours the interval runs. The check finds the cached installer and the prompt appears again. Unanswered prompts stack, one per interval. A manual "Check for updates" does the same immediately.
- **Why:** electron-updater 6.8.9 (`out/AppUpdater.js`, `executeDownload` cache branch, `done(false)` → `taskOptions.done` → `dispatchUpdateDownloaded`) re-emits `update-downloaded` for a cached installer, and our handler has no "already prompted for this version" guard.
- **Suggested fix:** Keep `promptedVersion` in the module. In the `update-downloaded` handler, return early when `info.version === promptedVersion` and the prompt is already open; set it when the prompt is shown. Also do not reset `latestStatus` away from `downloaded` in `checkForUpdatesNow` when a downloaded update is already held.
- **Regression test:** `updater.test.ts`: emit `update-downloaded` twice for the same version and assert `showMessageBox` is called once.

## DSK-12 Export, migration and reset parse the entire save on the Electron main thread (up to 256 MB per parse)

- **Severity:** Low-Medium performance (UI freeze and transient memory spike in the main process). Magnitude not measured in this session.
- **file:** `apps/desktop/main/world-safety/save-validation.ts:130` (`JSON.parse(text)` of the whole save); `MAX_REMOTE_SAVE_BYTES = 256 MiB` at `save-validation.ts:4`; callers: `ipc.ts:437-438` (`world:exportActive`), `ipc.ts:500-501` (reset with export), `ipc.ts:166` and `ipc.ts:182` (verify after migration/reset), `save-folder-migration.ts:53-54` and `:84-87` (`inspectSaveFolderMigrationSource`, `verifySaveFolderMigrationCopy`), which parse the same bytes again.
- **Repro:** With a large world, run File → Export world, or start a save-folder migration. The window and tray freeze during the read/decode/parse, and the main process's JS heap grows by a multiple of the file size (raw Buffer, decoded string, parsed object graph). A migration performs about four full parses.
- **Why:** The validator is a full JSON parse plus per-record checks, all synchronous on the main thread, and the migration path repeats it.
- **Suggested fix:** Run validation in a `worker_threads` Worker (or the sim itself, via a `/validate` route), and parse once per migration by passing the validated result through the journal path instead of re-reading. At minimum stream-hash the copy and compare hashes instead of re-parsing.
- **Regression test:** Benchmark-style test asserting `validateWorldSaveBytes` is called once per migration (spy), and that export does not block the event loop for more than N ms (measured with `perf_hooks.monitorEventLoopDelay`).

## DSK-13 The sim's `dotenvy::dotenv()` loads `.env` files from parent directories of the save folder (**verify**: dotenvy's walk-up behavior)

- **Severity:** Low (environment leakage; non-overriding, so only variables the desktop does not set are affected)
- **file:** `apps/server/src/main.rs:55` (`dotenvy::dotenv().ok()`); `apps/desktop/main/sim-process.ts:504` (`cwd: workdir`, the save folder, e.g. `~/Library/Application Support/The Human Box`).
- **Repro:** Put `THB_ADMIN_TOKEN=x` (or `THB_LOW_MEMORY=1`, `DAILY_EGRESS_MB=...`) in `~/.env`. Launch the desktop app. The sim's `router.rs:75` enables `POST /admin/reset-world` with that token, or `THB_LOW_MEMORY` changes memory behavior, because those variables are not set by `buildLocalSimEnv`.
- **Why:** The sim's cwd is the save folder, and `dotenv()` searches the cwd and its ancestors. The desktop's own `env` (`sim-env.ts`) only sets some variables and then relies on the sim not reading others from disk.
- **Suggested fix:** Use `dotenvy::from_path` only for an explicit path (or skip `dotenv()` entirely when `THB_DESKTOP_PARENT_PID` is set). Also pass `cwd` as a dedicated directory, not the save root.
- **Regression test:** Rust test: with `THB_DESKTOP_PARENT_PID` set and a `.env` in an ancestor dir, `THB_ADMIN_TOKEN` is not populated.

## DSK-14 Dev builds look for the simulator at a path that does not exist

- **Severity:** Low (developer-only)
- **file:** `apps/desktop/main/sim-process.ts:69-80` (`devBinaryPath()` resolves `__dirname/../../../simulation/target/release/`, which from `dist/main` is `apps/simulation/target/release`). `apps/simulation` does not exist; the Cargo workspace target is at the repo root (`target/`), and `apps/server` is the crate. The error at `sim-process.ts:428-432` tells developers to build "in `simulation/`".
- **Repro:** `pnpm run dev` on a clean checkout without copying the binary into `resources/bin`: "simulation binary not found ... build it via `cargo build --release` in simulation/".
- **Why:** The path was not updated when the repo was restructured (#194). The README's own instructions copy the binary to `resources/bin` as a workaround.
- **Suggested fix:** Point `devBinaryPath` at `path.join(__dirname, '..', '..', '..', '..', 'target', 'release', name)` (repo root), and update the error message to the real build command.
- **Regression test:** `sim-process` unit test for `devBinaryPath()` that asserts the resolved path exists after `cargo build` (skipped in CI without a binary) or at least matches the repo-root `target/`.

## DSK-15 Tray and View-menu state track the first window only, so they go stale after "Restart simulation"

- **Severity:** Low
- **file:** `apps/desktop/main/index.ts:524-525` (`mainWindow?.on("show", update)` / `"hide"`, bound once in `buildTray` to the initial window); `index.ts:391-392` (the "Always on top" checkbox `checked` value is computed once in `buildMenu`); `index.ts:432-436` (`createWindowReplace` swaps the window without rebuilding either).
- **Repro:** Enable "Always on top", then File → Restart simulation. The new window is not always-on-top, but the menu still shows it checked. Hide the window after the restart: the tray label still says "Hide window"/"Show window" from the old window's events.
- **Why:** Listeners and checkbox state are bound to the window object that existed at boot. `createWindowReplace` never updates them.
- **Suggested fix:** Subscribe to `mainWindow` changes (a `setMainWindow(win)` helper that rebinds listeners and rebuilds the tray menu and View menu state).
- **Regression test:** Unit test: after `createWindowReplace`, a `show` event on the new window calls the tray `update`.

## DSK-16 Desktop renderer has no Content-Security-Policy, while the preload can move the whole save folder

- **Severity:** Low (defense in depth)
- **file:** No CSP in `apps/web/index.html` or `public/`, and no `onHeadersReceived` / `Content-Security-Policy` in `apps/desktop/main` (grep returns nothing). `apps/desktop/preload/index.ts` exposes `world.migrateDataRoot`, which `ipc.ts:247-257` accepts for any absolute path; `settings.set` and `world.exportActive` are also exposed.
- **Repro:** Not an exploit by itself: no `innerHTML`/`dangerouslySetInnerHTML` sinks were found in `apps/web/src`. The risk is that any future DOM-injection bug in the renderer gets full access to the bridge, including relocating the save folder.
- **Why:** `sandbox: true` and `contextIsolation: true` are set (good), but without a CSP a script injected into the file:// page can load and send data to the network (PostHog is already loaded in desktop mode, `shared/observability.ts`).
- **Suggested fix:** Set a CSP via `session.defaultSession.webRequest.onHeadersReceived` for the renderer file (`default-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://us.i.posthog.com; img-src 'self' data: blob:; script-src 'self' 'wasm-unsafe-eval'`), and require a confirmation dialog in the main process for `migrateDataRoot` (it already uses a native picker, but the IPC accepts a raw path).
- **Regression test:** Electron integration check that the renderer response headers include a CSP; unit test that `migrateDataRoot` rejects a path not returned from `app:pickSaveDir` in the same session.

## DSK-17 The per-launch command token is shown on the boot error page and written to stderr

- **Severity:** Low (secret hygiene)
- **file:** `apps/desktop/main/index.ts:292-300` (`did-fail-load` builds the error page from `url`, which is the renderer URL with `?desktop=1&api=...&token=<uuid>`; `console.error` logs the same URL on the same line 294).
- **Repro:** Make the renderer fail to load (for example rename `renderer/`). The error page shows `URL: file:///.../index.html?desktop=1&api=127.0.0.1:NNNN&token=<uuid>`, which the user may paste into a bug report or screenshot. The same URL goes to stderr (and to `sim.log` if stderr is captured).
- **Why:** The token protects the sim against `Origin: null` pages (`sandbox_guard.rs`). Showing it on-screen or in logs spreads it outside the process.
- **Suggested fix:** Strip the `query` from the URL before displaying or logging (`new URL(url)`, clear `search`), and never include `token` in any rendered or logged string.
- **Regression test:** Unit test on a `redactUrlForDisplay(url)` helper that removes `token` and `api` query params; use it in `renderBootError` call sites.
