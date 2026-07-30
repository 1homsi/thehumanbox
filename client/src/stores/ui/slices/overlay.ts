import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

export interface OverlaySlice {
  overlay: string | null
  focus: string
  setOverlay: (o: string | null) => void
  setFocus: (f: string) => void
}

const OVERLAY_STORAGE_KEY = 'thb-map-overlay'
const VALID_OVERLAYS = new Set(['density', 'hazard', 'fertility', 'structures', 'trails', 'age', 'threat'])

function initialOverlay(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(OVERLAY_STORAGE_KEY)
    return saved && VALID_OVERLAYS.has(saved) ? saved : null
  } catch {
    return null
  }
}

function saveOverlay(overlay: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (overlay) window.localStorage.setItem(OVERLAY_STORAGE_KEY, overlay)
    else window.localStorage.removeItem(OVERLAY_STORAGE_KEY)
  } catch {
    // Map controls remain usable when browser storage is unavailable.
  }
}

export const createOverlaySlice: StateCreator<UIState, [], [], OverlaySlice> = (set) => ({
  overlay: initialOverlay(),
  focus: 'all',
  setOverlay: (o) => {
    saveOverlay(o)
    set({ overlay: o })
  },
  setFocus: (f) => set({ focus: f }),
})
