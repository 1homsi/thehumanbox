/**
 * What counts as a phone for the JS flags (low-performance rendering, the tour). Width alone is
 * wrong: a phone held sideways is 740-932 px wide but only 360-430 px tall, and it got desktop
 * settings. So a phone is either narrow, or a touch-only device (no hover) that is short. A
 * tablet is neither. The CSS phone blocks still use the width clause alone (see the PR for why).
 */
export const PHONE_QUERY = '(max-width: 767px), (pointer: coarse) and (hover: none) and (max-height: 500px)'
/** Matches the width-only CSS breakpoint that turns dialogs into bottom sheets. */
export const PHONE_SHEET_QUERY = '(max-width: 767px)'

export function isPhoneViewport(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !!window.matchMedia?.(PHONE_QUERY).matches
  } catch {
    return false
  }
}
