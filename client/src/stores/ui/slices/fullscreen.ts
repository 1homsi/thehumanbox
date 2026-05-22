import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

export interface FullscreenSlice {
  isFullscreen:  boolean
  setFullscreen: (b: boolean) => void
}

export const createFullscreenSlice: StateCreator<UIState, [], [], FullscreenSlice> = (set) => ({
  isFullscreen:  false,
  setFullscreen: (b) => set({ isFullscreen: b }),
})
