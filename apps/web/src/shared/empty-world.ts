export const DOCK_TAB_STORAGE_KEY = 'thb-sandbox-category'
export const EMPTY_WORLD_TAB = 'nature'

export function openEmptyWorldTab(): void {
  try {
    window.localStorage.setItem(DOCK_TAB_STORAGE_KEY, EMPTY_WORLD_TAB)
  } catch {
    return
  }
}

export function openEmptyWorldTabFromUrl(search: string): boolean {
  if (new URLSearchParams(search).get('empty') !== '1') return false
  openEmptyWorldTab()
  return true
}
