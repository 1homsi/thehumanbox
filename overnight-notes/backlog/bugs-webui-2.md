# Web UI bugs, pass 2 (research only, 2026-10-16)

Scope: `apps/web/src` React UI (App, ui/, game/scenes, game/render HUD/hover/camera hooks, shared/hooks, state/, simulation/useSimulation). Excludes the WebGL render drivers and entries already in `bugs.md`, `web.md`, `mobile.md`.

Base: origin/main 93d438b8 (0.5.87). Vitest runs under happy-dom with `react` `act`, against the locked Radix Dialog, React 19, zustand 5. Each confirmed item below was run as a throwaway test in the worktree (not committed). Items marked "reading only" were confirmed by code path but not run.

Ranked most severe first.

## UI-01 Opening a modal leaves keyboard focus on the button behind it, so the focus trap never engages

- **Severity:** High (keyboard and screen-reader users; the page behind the overlay stays operable)
- **File:** `apps/web/src/ui/modals/Modal.tsx:76` (`onOpenAutoFocus` calls `e.preventDefault()`)
- **Affected:** every `<Modal>` whose content has no `autoFocus` child: StatsModal, CivStatsModal, FamilyTreeModal, LifeModal, NotableOrgs, Chronicles, Goals, Achievements, Scenarios, AllLineages, About, DesktopSettings, Conversations, and others. `ConfirmDialog` and `WorldSilent` are fine because they have an `autoFocus` button.
- **Repro:** Focus a header button (for example Stats), press Enter. The dialog opens, but `document.activeElement` is still that button, outside `.thb-modal`. Tab then moves to the next focusable element in the page behind the overlay. Enter or Space on those controls runs them (dock tools, map toggles).
- **Why it is wrong:** Radix `FocusScope` only moves focus into the content when `onMountAutoFocus` is not prevented. With the prevent in place, nothing moves focus in. Its `focusin` guard only refocuses `lastFocusedElementRef`, which is still `null` because focus never entered the container, so the trap is a no-op. Dialogs opened from the keyboard also leave screen readers on the trigger instead of the dialog title.
- **Suggested fix:** Keep the prevent for the touch/phone case if it matters (the phone sheet is a drag target and a focus ring there is noise), but otherwise do not prevent. Simplest correct version: drop the `onOpenAutoFocus` override, or replace it with `e.preventDefault(); contentRef.current?.focus()` so focus enters the dialog without choosing the first control. `contentRef` already exists in `Modal`. Check that no consumer depends on the trigger keeping focus.
- **Regression test** (`ui/modals/scratch-modal-focus.test.tsx`, failing now, recorded as `expected 'trigger' to be 'inner'`):
  ```tsx
  // @vitest-environment happy-dom
  function Harness() {
    const [open, setOpen] = useState(false)
    return (<>
      <button id="trigger" onClick={() => setOpen(true)}>open</button>
      <Modal open={open} onClose={() => setOpen(false)} className="stats-modal" title="Stats" hideTitle>
        <p>body text</p><button id="inner">inner</button>
      </Modal>
    </>)
  }
  it('moves keyboard focus into the dialog when it opens', () => {
    // mount <Harness/>, focus #trigger, click it
    const dialog = document.querySelector('.thb-modal')!
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
  ```

## UI-02 Family tree pan, zoom and the +/−/fit buttons do nothing

- **Severity:** High (the whole tree is unnavigable beyond the initial identity transform; `touchAction: 'none'` shows touch panning was intended)
- **File:** `apps/web/src/ui/modals/FamilyTreeModal.tsx:201-218` (mount-only zoom effect), `:213` (`zoomRef.current = zoom`, reached only after the early return), `:472-480` (`zoomBy` and `fitTo` no-op without `zoomRef`), `:584` (canvas)
- **Repro:** Open Family tree on any population. Wheel over the canvas and drag: nothing moves. Press `＋`: no change. Press "fit all": no change. Confirmed in a test, asserting `canvas.__zoom.k` is `1.25` after `＋`; it stays `undefined`.
- **Why it is wrong:** The zoom effect has `[]` deps and returns early when `canvasRef.current` is null. The canvas is inside Radix `Dialog.Portal`, and `@radix-ui/react-portal` (`mounted` set in a layout effect) renders children only after a second commit, which runs after the passive effects of the first commit. So on the first effect run the canvas is absent, `d3.zoom` is never attached, and `zoomRef` stays `null`. Nothing re-runs the effect. Verified: `select(canvas).on('wheel.zoom')` is `undefined` after mount. Positive control (same probe on a directly attached canvas) returns a listener, and `scaleBy` through a transition updates `__zoom`.
- **Suggested fix:** Make the effect depend on the canvas being mounted: use a callback ref that stores the element in state, then run the zoom setup in an effect keyed on that element, or move the setup into a `useLayoutEffect` after the portal (still racy). Cleanest: `const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)` with `ref={setCanvas}`, and key the zoom effect on `[canvas]`. Also make `zoomBy`/`fitTo` not depend on a ref that can stay null.
- **Regression test** (`ui/modals/scratch-familytree-zoom.test.tsx` and `scratch-familytree-buttons.test.tsx`):
  ```tsx
  it('attaches pan/zoom to the tree canvas', () => {
    // mount <FamilyTreeModal organisms={[org('a',null,0), org('b','a',1)]} currentTick={0} onClose={() => {}} />
    const canvas = document.querySelector<HTMLCanvasElement>('.tree-modal canvas')!
    expect(select(canvas).on('wheel.zoom')).not.toBeUndefined()   // fails today
  })
  it('the + button zooms the tree', async () => {
    // mount as above, click document.querySelectorAll('.tree-zoom-btn')[0]
    await new Promise((r) => setTimeout(r, 400))
    expect((canvas as any).__zoom?.k).toBeCloseTo(1.25)           // fails today
  })
  ```

## UI-03 Event log rows are keyed by index, so the focused row unmounts whenever a new event arrives

- **Severity:** Medium (keyboard users lose focus on the event they were on; events arrive every few ticks)
- **File:** `apps/web/src/ui/panels/EventLog.tsx:98` (`key={`${e.tick}-${i}`}`)
- **Repro:** Tab into the event log. The rows are `role="button" tabIndex={0}` with Enter to go there. Focus a row, then let the sim produce one more event. The focused row is removed from the DOM and focus falls to `<body>`.
- **Why it is wrong:** `recent` is rebuilt newest-first on each `events` change, so `i` shifts by one for every older row. The key changes for every row, React remounts the list, and the focused element is destroyed. Confirmed in a test: `document.activeElement` is `body` after one `setWorld` with a new event.
- **Suggested fix:** Key by something stable per event. `SimEvent` has no id, so either add one to the sim's event records, or key by the event object itself via a `WeakMap<SimEvent, number>` id assigned once, or derive `key` from `${e.tick}-${e.type}-${e.actor}-${e.detail}` plus a per-tick ordinal counted from the oldest event (stable as long as events are append-only).
- **Regression test** (`ui/panels/scratch-eventlog-focus.test.tsx`, failing now):
  ```tsx
  it('keeps the focused event row mounted when a newer event arrives', () => {
    // setWorld(world([ev(1), ev(2), ev(3)])); render <EventLog/>
    const row = host.querySelector<HTMLElement>('.event-row[title="Go there"]')!
    act(() => row.focus())
    act(() => useWorldStore.getState().setWorld(world([ev(1), ev(2), ev(3), ev(4)])))
    expect(document.activeElement).toBe(row)   // fails today: activeElement is body
    expect(row.isConnected).toBe(true)
  })
  ```

## UI-04 Game hotkeys still fire while focus is on a result button inside the tool-search dialog

- **Severity:** Medium (a stray letter key can fire an instant world power, or toggle HUD, while the player is browsing search results)
- **File:** `apps/web/src/game/model/shortcuts.ts:48-51` (`typingTarget` looks for `[role="dialog"]`); `apps/web/src/ui/toolbar/WorldToolSearch.tsx:94` (`<dialog>` with no `role`); `apps/web/src/ui/toolbar/SandboxToolbar.tsx:217-226` (tool hotkeys, `typingTarget` gate); `apps/web/src/App.tsx:548-561` (H key, same `closest` list)
- **Repro:** Open the world-tool search (magnifier). Tab from the search box onto a result button. Press a tool hotkey letter (for example `q`, one of the first ten tools of the open tab). The tool is picked, and an instant tool fires immediately. Pressing `h` toggles immersive mode behind the dialog. Confirmed: `typingTarget(button inside <dialog class="world-tool-search">)` returns `false`.
- **Why it is wrong:** `typingTarget` documents that keys typed into a dialog belong to it, but the check looks for `role="dialog"`, and a native `<dialog>` does not carry that attribute. `escapeHandledElsewhere` already checks `closest('dialog')`, so the two helpers disagree.
- **Suggested fix:** Add `dialog` to the `typingTarget` selector list: `closest('input, textarea, select, dialog, [role="dialog"]')`. Check that the Radix consumers still behave (they already match on `role`).
- **Regression test** (`game/model/scratch-typing.test.ts`, failing now):
  ```ts
  // @vitest-environment happy-dom
  it('a button inside the native tool-search dialog is a typing context', () => {
    const dialog = document.createElement('dialog')
    dialog.className = 'world-tool-search'
    const result = document.createElement('button')
    dialog.append(result); document.body.append(dialog)
    expect(typingTarget(result)).toBe(true)   // fails today
  })
  ```

## UI-05 Life modal stays open and switches to another person when the selected organism changes

- **Severity:** Low (reachable mainly through the keyboard escape in UI-01; the modal then silently shows a different person)
- **File:** `apps/web/src/ui/panels/OrgDetail.tsx:57` (`showLife` state), `:78` (LifeModal renders with the current `org.id`); `apps/web/src/ui/panels/RightPanel.tsx:88` (`<OrgDetail>` has no `key`); `apps/web/src/App.tsx:432-446` (`[` / `]` next-person keys, gated only on `closest('button, input, ..., [role="dialog"]')`)
- **Repro (reading only):** Open an organism, click the Life icon. LifeModal opens. Focus remains on the Life button behind the overlay (UI-01). Tab, without using the button, to a non-button focusable such as the map. Press `]`. `selectOrg` changes `selectedOrg`, `RightPanel` reuses the `OrgDetail` instance (no key), so `showLife` stays `true`, and `LifeModal` receives the new `orgId` and fetches that person's life.
- **Why it is wrong:** The open life dialog is tied to a component instance, not to the organism it was opened for. Selection changes should close it or key it.
- **Suggested fix:** Key `OrgDetail` by `org.id` in `RightPanel` (`key={selectedOrg.id}`), or reset `showLife` in an effect on `org.id`. Fixing UI-01 also removes the main path.
- **Regression test (not written; reading only):** Render `OrgDetail` for org A, open Life, rerender with org B, expect no `.lang-modal.life-modal` or a title matching A.

## UI-06 Tribe rename draft survives the tribe's extinction and shows up in the next tribe's card

- **Severity:** Low (needs the rename field open when the tribe dies out, then a click on another tribe)
- **File:** `apps/web/src/ui/panels/TribeCard.tsx:69` (`editing` state is not tied to the lineage), `:104-125` (rename button and input); `apps/web/src/App.tsx:576` (`reconcileFocus` moves focus to `'all'` when the tribe dies); `App.tsx:746` (TribeCard always mounted)
- **Repro:** Focus tribe A, click its name, type "Draft". Tribe A dies out during the edit. `reconcileFocus` sets focus to `all`, the card returns `null` but stays mounted with `editing === 'Draft'`, and the input is removed. Focus tribe B. Its card now shows an autofocused rename field containing "Draft", and Enter renames B to "Draft". Confirmed in a test.
- **Why it is wrong:** The draft is component state keyed to nothing. It should be cleared when the lineage changes or the card hides.
- **Suggested fix:** Store the editing lineage with the draft (`{ lineage, draft }`) and ignore or clear it when `status.id` differs, or reset `editing` in an effect on `focus`. Blur-on-removal is browser-dependent (no blur fired on removal in the happy-dom run), so in some browsers the `onBlur` reset may mask the bug. Clearing on focus change removes the dependency.
- **Regression test** (`ui/panels/scratch-tribecard-rename.test.tsx`, failing in happy-dom):
  ```tsx
  it('does not carry a rename draft over to another tribe', () => {
    // render with focus lineage:a, click .tribe-card-rename, set input to 'Draft'
    // set focus 'all' and rerender with only b alive; then focus lineage:b and rerender
    expect(host.querySelector('.tribe-card-name-input')).toBeNull()   // fails today: value="Draft"
    expect(host.querySelector('.tribe-card-rename')?.textContent).toContain('Bren')
  })
  ```

## UI-07 Welcome dialog declares `aria-modal` but has no focus trap and no Escape

- **Severity:** Low (one-time first-run screen)
- **File:** `apps/web/src/ui/modals/WelcomeModal.tsx:59` (`role="dialog" aria-modal="true"`), no `keydown` handler or focus scope in the file
- **Repro (reading only):** On first visit, press Tab on the welcome card. Focus moves past the card to the header and map behind it. Escape does nothing, so the only exits are the buttons.
- **Why it is wrong:** `aria-modal` tells assistive tech that content outside is inert; the component does not enforce that, and there is no Escape to dismiss it. `Modal` (Radix) already gives both.
- **Suggested fix:** Render the welcome steps through `Modal` (the Radix dialog), or add a `FocusScope` trap and an Escape handler that calls `finish(false)`.
- **Regression test (not written; reading only):** Render `<WelcomeModal/>` with no stored seen flag, dispatch Tab from the last button, expect focus to stay inside `.welcome-modal`.

---

## Considered and dropped

- `DesktopSettingsModal.save` overwrites edits made while the IPC call is in flight. The window is one IPC round trip. Not worth a PR.
- `wasmDb.withRetry` drops the previous `IDBDatabase` handle on retry without `close()`. Harmless with `DB_VERSION` fixed at 1.
- `RightPanel.useThrottledValue`: the live and dead lists are sampled by two intervals created in the same commit, so they stay in phase. The "GONE" flicker I suspected does not occur.
- `getOwnWorldSeed` falls back to a random seed when `setItem` fails but `getItem` works. Only affects a fresh world after storage failure; the saved world in IndexedDB still restores.
- `EventLog` writes localStorage inside a `setState` updater. Idempotent, so harmless under StrictMode.
- `ConfirmHost` / `askConfirm` queue: checked, correct.
- `useSimulation` cleanup and reconnect logic: checked, guarded by `destroyed`, socket handlers detached before replacement.
- No undo/redo exists in the web UI, so that item has nothing to check.
- Store selectors: `WildlifePanel`, `LineagesList`, `EventLog` use `useShallow` on derived values; no whole-store subscriptions outside `App`.

## Notes for the next pass

- Modal consumers are the highest-leverage area: UI-01 affects most of them, so a single fix in `Modal.tsx` covers it.
- Scratch tests were run and then removed from the worktree; the snippets above are the regression tests to add.
