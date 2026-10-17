# Mobile support backlog: The Human Box web client (`apps/web`)

Scout report, read-only. Method: production build of `main` (4675e754, xipjs 0.15) served from `/tmp/mobile-dist` with the bench static server, headless Chrome over CDP (`bench/cdp.mjs`) with `mobile:true`, touch emulation and real touch events (`Input.dispatchTouchEvent`), DPR 3. Viewports: 360x740, 390x844, 768x1024 portrait; 844x390, 740x360, 1024x768 landscape. Seeded worlds: `standard` (169 people) and `crowd` (3,169). Screenshots are in `/Users/mhomsi/dev/extra/overnight/backlog/mobile-shots/` (shortened to `shots/` below). Scratch scripts: `/Users/mhomsi/dev/extra/overnight/scratch-mobile/`.

Every path below is relative to `apps/web/` unless it starts with `/`.

## What already works (do not redo)
- Viewport meta exists (`index.html:11`): `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`. No horizontal page overflow at any tested size (`scrollWidth == innerWidth` everywhere).
- One-finger pan and two-finger pinch on the map work on the GPU path. Measured: pinch moved zoom 0.077 -> 0.257, drag moved the camera in the right direction (`CfMapCameraController`, `WorldView.tsx:171` sets `touch-action: none`).
- Tap-to-select a person works (`useMapPointer.ts:105` already widens hit tests for `(pointer: coarse)`); a tap on empty map closes the bottom sheet. Evidence: `shots/p390-tap-person.png`, `shots/p390-after-map-tap.png`.
- Long-press shows dock tooltips on touch (`Tooltip.tsx:69`, 400 ms). Evidence: `shots/p390-longpress.png`.
- Modals are sized to the viewport and open as bottom sheets <=767px; resize/rotation re-measures the canvas and keeps the camera (`shots/rot-landscape-after-portrait.png`, `shots/rot-portrait-back.png`).
- `LOW_PERF` is switched on automatically at `max-width: 767px` (`src/shared/perf.ts:1`), `-webkit-tap-highlight-color` is already transparent (`00-base.css:18`).

## Headline findings
1. On phones (<=767px) the whole header action row is hidden with `display: none !important` (`src/styles/app/07-stats-details-and-mobile.css:228-235`). Stats, Civ, Chronicles, Search, More, Settings, the world (lineages/events) panel, the orgs panel and fullscreen are **unreachable**. The Cmd+K palette is the only other route and needs a keyboard. The Welcome modal even tells players to "reset it safely from Settings" (`shots/p360-after-welcome.png`).
2. Peril/prayer/weather/era chips are also hidden (`07...css:244-249`), and `B`, `P`, `[`, `]`, `H`, `0`, `+/-` have no touch alternative.
3. The dock is 210 px tall on phones (25 % of a 844 px screen; 29 % of 740) with 34 px tiles; in landscape phones the map is 222-232 px tall (`shots/l844-base.png`).
4. `100vh` everywhere (`index.css:77`, `00-base.css:11,193`, `07...css:302,380-413`) and only the dock honours `env(safe-area-inset-bottom)`; nothing uses the top/left/right insets even though `viewport-fit=cover`.
5. Perf on phone viewport (crowd, 3,169 people, 390x844 DPR 3, run under `bench-lock.sh`, perf.mjs): fit view 60.1 fps / 8.2 % main-thread busy unthrottled; at 6x CPU throttle 56.6 fps / 45 % busy (410 ms script per second); zoom 3 at 6x: 57.1 fps / 31.5 % busy. DPR 1 vs 3 made **no** difference on this Mac GPU (56.1 vs 56.6 fps, 45.9 vs 45 % busy), so the DPR-3 canvas (1170x1758 = 2.06 MP vs 0.23 MP) cost is a real-phone GPU question that headless desktop cannot answer. It is CPU/JS-bound here, which the engine tasks cover.

## Suggested PR order
A (shell and reachability) -> B (dock) -> C (map input) -> D (panels) -> E (modals) -> F (onboarding) -> G (perf/polish). Items inside a group are independent unless a dependency is stated. IDs are ordered so each PR can land alone.

---

## A. Shell, breakpoints, reachability

### MOB-01 Dynamic viewport units
- Size: S. Deps: none.
- Files: `src/index.css:76-77`, `src/styles/app/00-base.css:11,193`, `src/styles/app/07-stats-details-and-mobile.css:302,380,381,413`, `07...css` `max-height: 90vh !important` (line 384), `.tree-modal height: 90vh` (line 408).
- Change: `#root`, `.app`, drawers and sheets use `100dvh` (with `100vh` fallback line first); `vw` widths on sheets become `100%`. On iOS Safari the URL bar makes `100vh` taller than the visible area, so the dock's bottom row hides behind the toolbar.
- Evidence: grep above; `shots/p390-base.png` (dock at the very bottom, no inset slack).

### MOB-02 Safe-area insets on all four edges
- Size: S. Deps: MOB-01.
- Files: `src/styles/app/12-header-prayers.css` (header), `src/styles/app/11-world-dock.css:22,367` (dock already has bottom), `src/styles/app/07...css` (drawers/sheets), `src/styles/app/09-banner-welcome-scenes.css`, `index.html` meta.
- Change: header `padding-top: env(safe-area-inset-top)`, header/dock/drawers `padding-left/right: env(safe-area-inset-*)` for landscape with a notch; sheets get bottom inset. Add `apple-mobile-web-app-status-bar-style: black-translucent` only after the top inset is handled.
- Evidence: only 3 `env(` uses in all CSS, all bottom-only (grep). `shots/l844-base.png` shows header content flush to the edges.

### MOB-03 One `isMobile` definition, input-based, not width-only
- Size: M. Deps: none.
- Files: `src/shared/hooks/useIsMobile.ts`, `src/shared/perf.ts:1-3`, `src/ui/tour/tour.ts:13`, every `@media (max-width: 767px)` block (list: `07...css:208`, `09...css:5`, `10...css:118`, `11-world-dock.css:316`, `pixel-theme.css:204,255`).
- Change: derive from `(pointer: coarse) and (hover: none)` plus a size gate, expose as one CSS custom media / `data-coarse` attribute on `<html>`, and use it for the JS flags. Today a phone in landscape (844x390, 740x360) falls through to the **desktop** layout: full header, absolute 240/320 px drawers on a 232 px tall map, no mobile banner, tour enabled, `LOW_PERF` off. An iPad (768-1100) also gets the desktop layout with 40 px tiles.
- Evidence: `shots/l844-base.png`, `shots/l740-base.png`, `shots/t768p-base.png`, measured map heights 232 / 222 px.

### MOB-04 Phone menu: bring back everything the header hides
- Size: L. Deps: MOB-03 (uses the same flag).
- Files: `src/ui/toolbar/AppHeader.tsx:124-250`, `src/styles/app/07...css:228-249`, `src/ui/toolbar/MoreDropdown.tsx`, new sheet component using `Modal.tsx`.
- Change: instead of `display:none !important` on `.header-actions`, `.panel-toggle-btn`, `.fullscreen-btn`, add one 44 px "menu" button in the header opening a sheet with Stats, Civ, Search, Chronicles, Settings, World panel, Orgs panel, Fullscreen, About, Hotkeys-replacement list. Reuse the existing store openers (`openStats`, `openCiv`, `openChronicles`, `openOrgSearch`, `openSettings`, `toggleLeft`, `togglePanel`).
- Evidence: `shots/p390-base.png` (header: brand + time tag only); DOM audit: `.panel-toggle-btn`, `.fullscreen-btn` computed `display:none`; `shots/p360-after-welcome.png` (Settings mentioned but absent).

### MOB-05 Compact HUD chips on phones (peril, prayers, weather, era)
- Size: M. Deps: MOB-04.
- Files: `src/ui/panels/PerilChip.tsx`, `PrayerChip.tsx`, `src/ui/panels/WeatherChip.tsx`, `src/styles/app/07...css:244-249` (`.header-badges > :not(.time-tag) { display:none }`), `src/styles/app/12-header-prayers.css`.
- Change: show one badge row under the header (icon-only, 44 px) or fold into the menu sheet; "tribe on the brink" and "answer next prayer" become buttons (today they are `B` / `P` only, `src/game/model/shortcuts.ts:19-26`).
- Evidence: `shots/p390-base.png` (only the time tag is left).

### MOB-06 Landscape phone layout (<=500 px tall)
- Size: M. Deps: MOB-03.
- Files: `src/styles/app/11-world-dock.css`, `src/styles/app/12-header-prayers.css`, `src/styles/app/07...css`.
- Change: `@media (max-height: 500px) and (pointer: coarse)`: header 36 px, dock becomes a single row (tabs + one scrolling tile row + time) or an overlay tray that hides while panning, drawers/sheets become side sheets (right 45 % width) instead of 68vh (which at 360 px tall is 245 px, covering the map).
- Evidence: `shots/l844-base.png` (map 232 px of 390), `shots/l740-base.png` (222 of 360), `shots/p390-base.png` for comparison.

### MOB-07 Banners and toasts position from the real dock height
- Size: S. Deps: none.
- Files: `src/styles/app/10-toasts-worlds-tour.css:120,126`, `08-about-modal.css:116` (desktop-toast), `src/styles/app/09-banner-welcome-scenes.css:5-60`, `src/ui/toasts/MobileBanner.tsx`.
- Change: toasts use `bottom: calc(var(--dock-h) + safe-area)`, where `--dock-h` is set by a `ResizeObserver` on `.sandbox-bar`; hard-coded `116px` lands on the tab row of a 210 px dock. `MobileBanner` is an in-flow bar with a 28x28 close button and a blur; make it dismissible with a 44 px target and stop it stealing 50+ px from the map on a first run (`shots/p390-firstrun.png`, `shots/p360-after-welcome.png`), or drop it once the layout is usable (its copy says "full UI and panels" which MOB-04 makes true).

### MOB-08 Touch behaviour hygiene
- Size: S. Deps: none.
- Files: `src/index.css`, `src/styles/app/00-base.css`.
- Change: `html, body { overscroll-behavior: none }` (pull-to-refresh/rubber band; only 2 `overscroll-behavior` rules exist today, both in modals), `button, [role=button] { touch-action: manipulation; -webkit-touch-callout: none }`, `-webkit-touch-callout: none` on the map container and dock tiles (a long press on a tile starts the tooltip timer, but iOS also offers its callout on images/SVG). `user-select: none` already set on `body`.
- Evidence: grep shows no `touch-callout`, and `touch-action` only on the map container.

### MOB-09 Remove `maximum-scale=1` from the viewport meta
- Size: S. Deps: none.
- Files: `index.html:11`.
- Change: drop `maximum-scale=1` (blocks user zoom: an accessibility failure and Lighthouse error). The map already sets `touch-action: none` so it will not page-zoom; panels/modals then get normal pinch-zoom. Keep `initial-scale=1, viewport-fit=cover`, add `interactive-widget=resizes-content` so the virtual keyboard does not cover the org-search input.
- Evidence: `index.html:11`.

---

## B. World dock

### MOB-10 Dock footprint: 210 px -> about 110 px, collapsible
- Size: L. Deps: MOB-03, MOB-06 (shares the landscape rule).
- Files: `src/ui/toolbar/SandboxToolbar.tsx`, `src/styles/app/11-world-dock.css` (`.sandbox-bar`, `.dock-group`, `.dock-time`, `.dock-utility`, lines 5-343), `src/ui/toolbar/dock-tabs.ts`.
- Change: on touch, show one horizontally scrolling tile row (snap scroll, group labels) under the tabs, move speed buttons into the play button (tap = pause, long-press/expand = speeds), and let the player collapse the dock to just the tab strip. Phone dock is 210 px of 844 (measured `.sandbox-bar` height 210); `.dock-group` rows are 3 high on 390 px.
- Evidence: `shots/p390-base.png`, `shots/p360-base.png`.

### MOB-11 Dock tap targets to 44 px on coarse pointers
- Size: M. Deps: MOB-10 (do together or right after).
- Files: `src/styles/app/11-world-dock.css:14,198-201,281-296,343`.
- Change: `@media (pointer: coarse)`: `--dock-tile: 44px` (it is forced to 40 at <=1100 and 34 on phones), tab height 40+, speed buttons min-height 36-44 (currently 32x17), `.dock-mini` 44. Audit hits on 390x844: `dock-tab` 42x36 / 44x32, `dock-tile` 34x34, `dock-speed` 32x17, `dock-mini` 34x34, `dock-play` 104x40. The 4px gaps then need to grow so a thumb does not hit two tiles.
- Evidence: audit output (390 and 768), `shots/p390-base.png`.

### MOB-12 Scroll affordance for clipped dock content
- Size: S. Deps: none.
- Files: `src/styles/app/11-world-dock.css:44-60` (`.dock-tabs { overflow-x:auto; scrollbar-width:none }`), the tile strip container.
- Change: edge fade + `scroll-snap`, and "peek" the next column. At 360 px the fifth tile column is cut off with no hint (`shots/p360-after-welcome.png`: tile grid ends mid-tile), and in landscape the groups run past the viewport (`DIV.dock-group l502 r980`).

### MOB-13 Armed-tool UX on touch
- Size: M. Deps: none.
- Files: `src/ui/toolbar/SandboxToolbar.tsx`, `src/ui/toolbar/tool-tips.ts`, `src/game/render/WorldMapHud.tsx:23-50`, `src/game/render/WorldView.tsx:~170` (cursor).
- Change: (a) tooltip copy is keyboard-only ("press E · click the world · - = brush · esc to stop"): show `tap the map · hold to ...` on coarse pointers; (b) there is no visible way to disarm a tool without Esc: add a "stop" chip next to the 1/2/3/5 brush chip that appears over the map while armed (`shots/p390-longpress.png` shows the chip row with no cancel); (c) the brush preview ring is driven by `pointermove` only (`WorldMapHud.tsx:44`), so touch gets no preview: show it at the touch point during press and drag; (d) while armed, check whether a one-finger drag should paint or pan (today only taps apply: `useMapPointer.ts:71-74`).
- Evidence: `shots/p390-armed.png`, `shots/p390-longpress.png`.

---

## C. Map input and view

### MOB-14 On-screen zoom / fit / recenter controls
- Size: M. Deps: none.
- Files: new `src/game/render/MapControls.tsx`, mounted in `WorldView.tsx` with `data-map-ui` (so `isMapControl` ignores it); drives `commandRef` (`{kind:'zoom'|'fit'|'focus'}`, `camera-controls.ts:11`).
- Change: +/- and "fit world" buttons (44 px, bottom-right above the dock, safe-area aware), plus a "follow selected / locate" button. Touch has only pinch; keyboard `0`, `+`, `-`, WASD and the wheel are the only other zoom/fit inputs. Add double-tap-to-zoom (S, same PR).
- Evidence: `data-map-ui` appears once in all of `src` (the draw error box, `WorldView.tsx:288`).

### MOB-15 Opening view fills the portrait viewport
- Size: M. Deps: none.
- Files: `src/game/render/camera-controls.ts:17-28` (`minMapZoom` 0.85x fit, `initialMapCamera` 0.95x fit).
- Change: the world is 2:1 (600x300 tiles) so on a 390x586 map the island occupies about 195 px of height with ~190 px of empty ocean above and below (`shots/p390-base.png`, `shots/t768p-base.png`). On coarse portrait viewports open at "fit height with a bias to the busiest settlement" (or fit to land bounds from `world.grid`), and compute `minZoom` from the land extent so the player cannot zoom out to a postage stamp. Needs a product call on whether to keep the "whole world" first view; the zoom bounds are safe either way.

### MOB-16 Keep a tapped person visible above the bottom sheet
- Size: M. Deps: MOB-17 (sheet snap heights).
- Files: `src/game/render/world-view/useMapPointer.ts` (`select` outcome), `src/game/render/cf/input/CfMapCameraController.tsx`, `src/game/render/camera-controls.ts`, `src/state/store.ts` (selection).
- Change: when the right sheet opens on a phone it covers 68 % of the screen, so the selected person (at y=498 in the test) ends up under the sheet and the visible 222 px strip shows only sea (`shots/p390-tap-person.png`). After selecting, shift the camera so the person sits at the centre of the visible strip (`containerH - sheetHeight`), and restore on close.
- Evidence: `shots/p390-close.png` (before tap), `shots/p390-tap-person.png` (after).

### MOB-17 Name labels at high zoom are oversized on phones
- Size: S. Deps: none.
- Files: `src/game/render/settlement-labels.ts` (`labelScale`), `src/game/render/cf/overlays/` people labels (`people/people-labels`), `src/game/render/render-timing.ts`.
- Change: cap the label font in CSS px (name tags are ~28 css px / 80+ device px tall at zoom 5 on DPR 3 and overlap neighbours: "Jema", "Tegel" in `shots/p390-close.png`); scale labels down on coarse pointers, and limit max zoom (camera went to 5-6 on a phone) or tie `MAX_MAP_ZOOM` to DPR so pixels are not magnified to blocks.

### MOB-18 Territory hover card has no touch equivalent
- Size: S. Deps: none.
- Files: `src/game/render/hover/TerritoryHoverCard.tsx:65-87` (pointermove only), `useMapPointer.ts` `territory` outcome.
- Change: on touch a tap on a territory only focuses a lineage (`setFocus`); show the same info as a small anchored card on tap (auto-hide on next tap/pan) so the data is reachable without hover. Also `.lineage-row:hover` etc. are only styling; `AppHeader` `.tip-card` shows on hover only (`AppHeader.tsx:74`): move to long-press or the menu.

---

## D. Panels (right sheet, world panel)

### MOB-19 Bottom sheet: snap heights, drag handle, no overlap with dock
- Size: M. Deps: MOB-03.
- Files: `src/styles/app/07...css:324-355` (fixed `height: 68vh`, `.panel-right::before` is a decorative bar), `src/ui/panels/RightPanel.tsx`, `src/App.tsx` panel render (~line 677).
- Change: peek (about 35 %: name, bars, follow button) / half / full snap with a real drag handle and swipe-down to dismiss; stop covering the dock; `overscroll-behavior: contain` inside. Also pass the sheet height to MOB-16. Today it is one height, closes only by tapping the map, and `panel-overlay` exists only for the left panel.
- Evidence: `shots/p390-tap-person.png`, `shots/p390-tap-person-scrolled.png`.

### MOB-20 Org detail layout bugs at 390 px
- Size: S. Deps: none.
- Files: `src/ui/panels/org-detail/bars.tsx`, `src/styles/app/02-organism-details-conversations.css`, `03-history-orgdetail-ticker.css`.
- Change: the needs bars (energy/hydration/health) draw on top of their labels (`energy`, `hydration`, `health` overlap the bars; `shots/p390-tap-person.png` around y=1090), the "joyful 1121 ticks" and "experience 108 states" rows wrap their values into two lines, and the label column is a fixed width. Make rows a 2-col grid with `min-width:0` and let the value wrap below on narrow widths.

### MOB-21 Tap targets in panels
- Size: S. Deps: none.
- Files: `src/ui/panels/org-detail/OrgHeader.tsx`, `.icon-btn` (22x22: star, journal, locate, close), `.org-action-btn`, `.view-all-btn`, `.starred-toggle`, `.lineage-row`, `EventRow.tsx`.
- Change: `@media (pointer: coarse)` min 40-44 px hit area (can be padding or `::after` for pixel-art frames). Audit on a selected person: `icon-btn`/`icon-close` 22x22, `org-action-btn` 9px text, `view-all-btn` 9px.
- Evidence: audit output on `shots/p390-tap-person.png` state.

### MOB-22 Font-size floor for phone panels and modals
- Size: M. Deps: none (best after MOB-20).
- Files: `src/styles/app/*.css`, `src/pixel-theme.css`. Offenders measured on the org panel at 390 px: `.org-attr-tag` 7px (x640 nodes), `.attitude-tag` 7px, `.bar-label`/`.bar-pct` 8px (x500), `.trait-full-label` 8px, `.org-sex-badge` 8px, `.relation-tag` 9px, `.org-meta` 9px, `.civ-summary-*` 9px; `.stats-rel-muted` 9px, `.section-title` 10px, `05-chronicle-...css` has 8-9px at lines 14,35,42,62,133,157.
- Change: a `--fs-min` token (11 px, 12 px for body copy) applied under the coarse-pointer media query; the real fix for the unreadable chart axes in MOB-24 too. Keep desktop sizes.

### MOB-23 World panel (lineages, events) as a phone sheet
- Size: S. Deps: MOB-04 (it is unreachable today).
- Files: `src/styles/app/07...css:276-300` (80vw / max 320 fixed drawer), `src/ui/panels/LineagesList.tsx`, `EventLog.tsx`, `EventRow.tsx`.
- Change: after it is reachable, check it as a left drawer (width, overlay close, row heights, event-row tap = focus on map and close the drawer). I could not render it: forcing `.open` showed an empty drawer because content mounts only from `leftOpen` state (`App.tsx:679`); `shots/p390-leftpanel-forced.png` is that empty drawer, not a defect.

---

## E. Modals

### MOB-24 Modal sheet CSS cleanup (`!important` vw/vh)
- Size: S. Deps: MOB-01.
- Files: `src/styles/app/07...css:372-415`, `src/ui/modals/modal-theme.css:9-14`.
- Change: the phone override forces `width: 100vw !important; max-width: 100vw !important; max-height: 90vh !important` on twelve modal classes and fights `modal-theme.css`'s `calc(100dvh - 32px)`. Use `100%`/`dvh`, add bottom safe-area padding and a drag-to-dismiss grabber, 44 px close button (`.thb-modal .close-btn` is min 32x32), and let the backdrop tap close. Header already wraps (`flex-wrap`).
- Evidence: `shots/p390-modal-stats.png` (sheet starts at y=42 with 10 % dead gap above it), `shots/p390-modal-chron.png`.

### MOB-25 Civilization table overflows
- Size: S. Deps: none.
- Files: `src/styles/app/08-about-modal.css:371-395` (`.civ-table`), `src/ui/modals/CivStatsModal.tsx`.
- Change: DOM check at 390 px reports `TABLE.civ-table`/`TH` wider than the viewport; "missing agricultur…", "missing ironworkin…" are clipped. Switch rows to stacked cards under 600 px.
- Evidence: `shots/p390-modal-civ.png`.

### MOB-26 Org search modal on phones
- Size: S. Deps: none.
- Files: `src/ui/modals/OrgSearchModal.tsx`, `src/styles/app/05-chronicle-life-family-search-modals.css:185-200`, `07...css:392-406`.
- Change: the placeholder reads "<- select an organism to view details" while the layout is stacked (detail below the list, capped at 35vh and invisible until a selection); filter chips are about 24 px tall; give selection an explicit "details" push (full-screen detail view with a back button) instead of the 40vh/35vh split, and keep the search input (13 px) at >=16 px so iOS does not zoom on focus (relevant once MOB-09 removes `maximum-scale`).
- Evidence: `shots/p390-modal-search.png`.

### MOB-27 Stats charts on narrow widths
- Size: S. Deps: MOB-22.
- Files: `src/ui/modals/StatsModal.tsx`, `src/styles/app/06-tooltips-weather-stats-modal.css`.
- Change: axis labels render at about 7 px ("176", "d1 .. d15" in `shots/p390-modal-stats.png`), the stat tiles wrap into three uneven rows, charts keep a fixed tall height with large empty bands ("the first year is still turning…" sections take 250 px each). Make charts a fixed aspect ratio and the axis font `max(10px, ...)`.

### MOB-28 Family tree modal needs a touch pass (untested)
- Size: M. Deps: none.
- Files: `src/ui/modals/FamilyTreeModal.tsx` (own canvas, `dpr` at lines 263-273, mouse pan/zoom), `07...css:408` (`.tree-modal` 90vh).
- Change: I did not open it (reachable only from an org's tree button). Verify one-finger pan, pinch, tap-to-select; use `touch-action: none` and pointer events with two-finger zoom; cap its `devicePixelRatio` canvas at 2. Flag as "audit first", could be a no-op.

### MOB-29 Settings modal on phones (untested; MOB-04 prerequisite)
- Size: S. Deps: MOB-04.
- Files: `src/pixel-theme.css:459-480,650-668`, `src/ui/modals/DesktopSettingsModal.tsx`.
- Change: width `min(780px, 100vw - 24px)`, 170 px tab column collapsing at 600 px, `max-height: min(70vh, 640px)` (vh). Once reachable, re-check tab row scrolling, switch hit areas (`.px-switch`), and that the low-perf toggle (`:255`) text matches the automatic phone behaviour.

---

## F. Onboarding

### MOB-30 Tour copy and layout on touch tablets
- Size: S. Deps: MOB-03.
- Files: `src/ui/tour/tour-runner.ts`, `src/styles/app/10-toasts-worlds-tour.css` (shepherd styles), `src/ui/tour/tour.ts`.
- Change: on 768-1100 px touch devices the tour runs (`isTourSupported` is width-only) with mouse copy ("Drag to pan, scroll to zoom ... Click one to follow them"); the popover is a fixed 380 px, the Next/Back buttons are 65x35 and 150x39, and step "The world" lands on the dock tab row (`shots/t768p-tour-2.png`, `shots/t768p-tour-0.png`). Switch the copy by `pointer: coarse`, 44 px buttons, constrain popover to `100vw - 24px`, and flip placement away from the dock.
- Evidence: `shots/t768p-tour-0.png`, `t768p-tour-1.png`, `t768p-tour-2.png`, `shots/t768p-welcome-2.png`.

### MOB-31 First-run coach marks for phones
- Size: M. Deps: MOB-04, MOB-14.
- Files: `src/ui/tour/tour.ts:11-15`, `src/ui/modals/WelcomeModal.tsx:12-13`, `tour-runner.ts`.
- Change: the tour is disabled below 768 px, so phones get five welcome slides and then nothing: no hint to pinch, long-press tiles, or tap a person. Add a three-step phone version (pan/pinch, tap a person, pick a tool and tap the map) using the same Shepherd runner with phone steps, or a one-time dismissible hint.
- Evidence: `shots/p390-firstrun.png`, `shots/p360-welcome-2.png`.

### MOB-32 Welcome modal and idle-resume at 360 px
- Size: S. Deps: none.
- Files: `src/styles/app/09-banner-welcome-scenes.css:181`, `04-language-modal.css:35-39` (idle-resume backdrop).
- Change: the Welcome headline "Private and local by default" wraps at 360 px with wide letter-spacing; copy references Settings (MOB-04). Minor. Keep `Back`/`Next` at >=44 px (measured 74x39). Bundle with the copy fix.

---

## G. Performance and polish specific to phones

### MOB-33 Cap the renderer DPR on phones
- Size: M. Deps: engine support check (xipjs `Game`, `onDemand` mode; look in `/Users/mhomsi/dev/extra/1homsi/cubeforge/cubeforge/packages/renderer`).
- Files: `src/game/render/WorldView.tsx:~215` (`<Game ...>`), `src/game/render/render-timing.ts:1-5` (`worldRenderScale` already caps density at 1 for low perf but only for overlay painting), `src/game/render/terrain-tiles/sync.ts:50`, `src/game/render/cf/overlays/CfOverlays.tsx:135`.
- Change: pass a `dpr = min(devicePixelRatio, 2)` (1.5 when `LOW_PERF`) to the engine canvas. Measured backing sizes at 390x844 DPR 3: main canvas 1170x1758 (2.06 MP), 768x1024 tablet 2304x2598. On this Mac headless, DPR 1 vs 3 changed nothing (56.1 vs 56.6 fps at 6x throttle, 45.9 vs 45 % busy), so verify on a real phone (or Chrome remote debug on Android) before claiming a win; I could not measure GPU fill cost here.
- Evidence: `/Users/mhomsi/dev/extra/overnight/scratch-mobile/perf.mjs` numbers above.

### MOB-34 Replace `backdrop-filter` blur with a flat scrim on coarse pointers
- Size: S. Deps: none.
- Files: `src/styles/app/00-base.css:60` (`.cmd-backdrop blur(3px)`), `04-language-modal.css:39` (blur 4px), `09-banner-welcome-scenes.css:21,61` (banner blur 8px, welcome backdrop blur 6px), `10-toasts-worlds-tour.css:21` (update toast blur 8px) and the desktop toast copy; 8 usages total.
- Change: the map is a live WebGL canvas that repaints continuously (`Game mode="onDemand"` still redraws when anything animates); a blur behind a modal forces a re-blur of that region each frame on mobile GPUs. Under `@media (pointer: coarse), (max-width: 767px)` use `background: rgb(10 7 4 / 86%)` and no filter. The welcome modal and the mobile banner are on screen during the first, most perf-sensitive seconds. Not measured on device.

### MOB-35 `LOW_PERF` for tablets and landscape phones
- Size: S. Deps: MOB-03.
- Files: `src/shared/perf.ts:1-20`, `src/game/render/cf/overlays/{atmosphere,paint-ground,CfOverlays}.ts*`, `cf/vegetation/trees-driver.ts`.
- Change: `IS_MOBILE` is `max-width: 767px`, so an iPad (768-1024, DPR 2) and a phone in landscape get full effects; base it on coarse pointer + `devicePixelRatio >= 2` + memory/cores heuristics already there. Also re-evaluate on `matchMedia` change (it is evaluated once at module load: rotating a 390 px phone to 844 px keeps `LOW_PERF` true by luck, but resizing a desktop window never flips it).

### MOB-36 Pause work while hidden or while a full-screen sheet is open
- Size: M. Deps: none.
- Files: `src/game/render/cf/render-loop.ts`, `WorldView.tsx` (`rendererPaused`), `src/simulation/useSimulation.ts:726`.
- Change: when a modal sheet covers the map (all phone modals are >=90 % of the screen) or the page is `hidden`, stop the render loop and the sim tick scheduling (battery and thermals on phones); `rendererPaused` prop already exists, check what drives it. Needs a battery/power measurement on device; mark follow-up "unmeasured".

### MOB-37 PWA manifest polish
- Size: S. Deps: MOB-02.
- Files: `public/site.webmanifest`, `index.html`.
- Change: manifest has `display: standalone` but no `start_url`, `scope`, `orientation`, maskable icon, or `theme_color` split; add them so "Add to Home Screen" gives a full-screen app, and add `apple-mobile-web-app-title` / status-bar style once safe-area padding is in.
- Evidence: manifest content (4 keys + 2 icons).

### MOB-38 Touch regression test harness
- Size: M. Deps: MOB-04 (most value after layout lands).
- Files: new `apps/web/bench/mobile.mjs` (reuse `bench/cdp.mjs`, `static-server.mjs`, seeded fixtures), CI optional.
- Change: scripted checks that fail on regressions: `scrollWidth == innerWidth` at 360/390/768 portrait and landscape, every visible interactive element >= 44 px (the audit used here, `scratch-mobile/audit.js`), pinch/pan/tap-select produce camera/selection changes, modals fit. This is the cheap guard for MOB-04..MOB-29.

---

## Summary table

| ID | Group | Size | Deps |
|---|---|---|---|
| MOB-01 | A | S | none |
| MOB-02 | A | S | 01 |
| MOB-03 | A | M | none |
| MOB-04 | A | L | 03 |
| MOB-05 | A | M | 04 |
| MOB-06 | A | M | 03 |
| MOB-07 | A | S | none |
| MOB-08 | A | S | none |
| MOB-09 | A | S | none |
| MOB-10 | B | L | 03, 06 |
| MOB-11 | B | M | 10 |
| MOB-12 | B | S | none |
| MOB-13 | B | M | none |
| MOB-14 | C | M | none |
| MOB-15 | C | M | none |
| MOB-16 | C | M | 19 |
| MOB-17 | C | S | none |
| MOB-18 | C | S | none |
| MOB-19 | D | M | 03 |
| MOB-20 | D | S | none |
| MOB-21 | D | S | none |
| MOB-22 | D | M | none |
| MOB-23 | D | S | 04 |
| MOB-24 | E | S | 01 |
| MOB-25 | E | S | none |
| MOB-26 | E | S | none |
| MOB-27 | E | S | 22 |
| MOB-28 | E | M | none (audit first) |
| MOB-29 | E | S | 04 |
| MOB-30 | F | S | 03 |
| MOB-31 | F | M | 04, 14 |
| MOB-32 | F | S | none |
| MOB-33 | G | M | engine check |
| MOB-34 | G | S | none |
| MOB-35 | G | S | 03 |
| MOB-36 | G | M | none |
| MOB-37 | G | S | 02 |
| MOB-38 | G | M | 04 |

## Not tested / caveats
- Real-device behaviour (iOS URL bar, safe areas, thermals, GPU fill): headless Chrome with mobile emulation only; safe-area and `dvh` findings come from CSS reading plus the absence of `env()` use, not from a device.
- Family tree modal, Settings modal, Conversations, Life, Chronicles contents were not walked on touch (MOB-28, MOB-29 are audit-first).
- The world (left) panel could not be rendered without a UI to open it (see MOB-23).
- `pnpm build` in the checkout fails only at `closeBundle` (`dist/version.json` ENOENT when `--outDir` is outside `dist`); bundles themselves built. The checkout's `node_modules` is stale (no `xipjs`), so I built from a copy in `/tmp/mobile-web` with another worktree's `node_modules`; no repo files were modified. A dev server (`vite`) in this checkout also fails to load `WorldView` (dependency re-optimisation), unrelated to mobile.
