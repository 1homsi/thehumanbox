const listeners = new Set<() => void>()
let openSheetCount = 0

function notify(): void {
  for (const listener of listeners) listener()
}

/** Register a mounted, open sheet modal and return its idempotent cleanup. */
export function registerOpenSheet(): () => void {
  openSheetCount++
  notify()
  let registered = true
  return () => {
    if (!registered) return
    registered = false
    openSheetCount = Math.max(0, openSheetCount - 1)
    notify()
  }
}

export function subscribeToOpenSheets(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasOpenSheet(): boolean {
  return openSheetCount > 0
}

export function shouldPauseForPhoneSheet(sheetOpen: boolean, phoneSheetViewport: boolean): boolean {
  return sheetOpen && phoneSheetViewport
}
