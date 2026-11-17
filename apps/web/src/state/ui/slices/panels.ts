import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

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
  leftOpen: false,
  showMore: false,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleMore: () => set((s) => ({ showMore: !s.showMore })),
})
