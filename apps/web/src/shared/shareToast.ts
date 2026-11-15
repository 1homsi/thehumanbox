/** A copied share card asks for a small toast; the event keeps the toast out of the share flow's return value. */
export const SHARE_TOAST_EVENT = 'thb-share-toast'

export function showShareToast(text: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SHARE_TOAST_EVENT, { detail: { text } }))
}
