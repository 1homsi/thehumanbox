import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

const isWideViewport = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches

export interface PanelsSlice {
  panelOpen: boolean
  leftOpen: boolean
  showMore: boolean
  togglePanel: () => void
  toggleLeft: () => void
  toggleMore: () => void
}

export const createPanelsSlice: StateCreator<UIState, [], [], PanelsSlice> = (set) => ({
  panelOpen: false,
  leftOpen: isWideViewport,
  showMore: false,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleMore: () => set((s) => ({ showMore: !s.showMore })),
})
