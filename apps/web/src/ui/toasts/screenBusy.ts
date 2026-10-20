import { useUIStore } from '../../state/store'

/** How often a due toast looks again while something else holds the screen. */
export const TOAST_RETRY_MS = 5_000
/** Cards a first-visit toast waits behind: the welcome, the tour, any dialog, and the other toasts. */
const BUSY =
  '.welcome-modal, .thb-shepherd, .thb-modal, .desktop-toast, .update-toast, .mobile-banner, .idle-resume-panel'

/** True while a toast should hold off: something else is up, the tab is hidden, or the player is in photo mode or hid the UI. */
export function screenBusy(): boolean {
  const { photoMode, hideUI } = useUIStore.getState().viewFlags
  return document.hidden || photoMode || hideUI || document.querySelector(BUSY) !== null
}
