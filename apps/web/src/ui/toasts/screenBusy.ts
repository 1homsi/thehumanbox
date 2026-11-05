import { useUIStore } from '../../state/store'

/** How often a due toast looks again while something else holds the screen. */
export const TOAST_RETRY_MS = 5_000
/** Cards a first-visit toast waits behind: the welcome, the tour, any dialog, and the other toasts. */
const BUSY =
  '.welcome-modal, .thb-shepherd, .thb-modal, .desktop-toast, .update-toast, .mobile-banner, .idle-resume-panel'

/**
 * True while a toast should hold off: something else is up, the tab is hidden, or the player is in photo mode or hid
 * the UI. A card that is already showing passes its own selector as `self`, so it does not count as something else.
 */
export function screenBusy(self?: string): boolean {
  const { photoMode, hideUI } = useUIStore.getState().viewFlags
  if (document.hidden || photoMode || hideUI) return true
  if (!self) return document.querySelector(BUSY) !== null
  return [...document.querySelectorAll(BUSY)].some((card) => !card.matches(self))
}
