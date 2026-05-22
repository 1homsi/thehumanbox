import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

export interface OverlaySlice {
  overlay: string | null
  focus:   string
  setOverlay: (o: string | null) => void
  setFocus:   (f: string) => void
}

export const createOverlaySlice: StateCreator<UIState, [], [], OverlaySlice> = (set) => ({
  overlay: null,
  focus:   'all',
  setOverlay: (o) => set({ overlay: o }),
  setFocus:   (f) => set({ focus: f }),
})
