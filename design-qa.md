# Bottom Game Dock Design QA

## Evidence

- Source visual truth: `/var/folders/x_/ljryhzvn18s0r2_1j4kf_1kc0000gn/T/TemporaryItems/NSIRD_screencaptureui_vifGIN/Screenshot 2026-07-28 at 2.29.27 PM.png`
- Reference pattern: WorldBox gameplay screenshots showing one persistent bottom tool dock
- Implementation: `/Users/mhomsi/personal/code/thehumanbox-web-local-only/.playwright-cli/page-2026-07-28T11-37-34-916Z.png`
- Focused comparison: `/Users/mhomsi/personal/code/thehumanbox-web-local-only/.playwright-cli/toolbar-design-qa.png`
- Responsive captures:
  - 900 x 700: `/Users/mhomsi/personal/code/thehumanbox-web-local-only/.playwright-cli/page-2026-07-28T11-36-00-819Z.png`
  - 700 x 700: `/Users/mhomsi/personal/code/thehumanbox-web-local-only/.playwright-cli/page-2026-07-28T11-36-18-198Z.png`
- Source pixels: 2156 x 790 at native density
- Implementation pixels: 1280 x 720 at device scale factor 1
- State: populated local WASM world, bottom sandbox controls visible, time category active

The source screenshot is the rejected before-state rather than a pixel-perfect target. The comparison therefore checks the requested structural change: replace four vertically floating cards with one edge-anchored WorldBox-style dock while preserving the existing Human Box palette and controls.

## Full-view comparison

The implementation uses one 64px bottom strip. Categories, current tools, runtime status, and local save state share a single horizontal hierarchy. The world keeps substantially more usable vertical space and the controls now read as part of the game frame rather than detached overlays.

## Focused region comparison

The combined comparison shows the prior four-level stack above the revised single row. A focused region was required because toolbar spacing, grouping, active states, and edge anchoring are too small to judge reliably in the full-world capture.

## Required fidelity surfaces

- Fonts and typography: existing monospace game typography is preserved; labels remain legible at desktop sizes and compact at narrow sizes.
- Spacing and layout rhythm: category and active-tool groups are separated by one divider; wrapping is removed; status and save are integrated into the same row.
- Colors and visual tokens: existing brown, parchment, and gold active-state tokens are preserved.
- Image and icon quality: existing product icons are reused without introducing replacement artwork.
- Copy and content: existing category names, tool names, runtime status, and local-save messaging are preserved.

## Comparison history

1. P1: category tabs, active tools, runtime state, and save state formed four floating cards and consumed too much world space.
   - Fix: replaced the vertical stack with one full-width bottom dock and a single horizontal interaction hierarchy.
   - Post-fix evidence: desktop implementation and focused comparison listed above.
2. P2: promotional and update toasts could overlap the new dock.
   - Fix: moved game toasts above the 64px dock, including the compact mobile offset.
   - Post-fix evidence: the 900 x 700 capture shows the 3D invitation clearing the dock.
3. P2: narrower layouts could wrap controls back into a stack.
   - Fix: the dock now remains one row and scrolls horizontally when necessary; low-priority save/status text collapses first.
   - Post-fix evidence: 900 x 700 and 700 x 700 captures.

## Findings

No actionable P0, P1, or P2 differences remain for the requested bottom-dock direction.

P3 follow-up: a keyboard shortcut to hide the dock could provide a cleaner observation mode, matching a useful option in newer WorldBox UI.

## Interaction and runtime checks

- Category selection swaps the active tool group.
- Time controls retain acknowledged active states.
- Local save and retry semantics remain covered by tests.
- Horizontal responsive behavior was inspected at 1280, 900, and 700 CSS pixels.
- Browser console: 0 errors and 0 warnings.

final result: passed
