import { create } from 'zustand'
import type { UIState, ViewFlags } from './types'
import {
  createSelectionSlice,
  createStarredSlice,
  createModalsSlice,
  createPanelsSlice,
  createOverlaySlice,
  createViewFlagsSlice,
  createNerdStatsSlice,
  createFullscreenSlice,
  createInteriorSlice,
} from './slices'

export type { UIState, ViewFlags }

export const useUIStore = create<UIState>()((...a) => ({
  ...createSelectionSlice(...a),
  ...createStarredSlice(...a),
  ...createModalsSlice(...a),
  ...createPanelsSlice(...a),
  ...createOverlaySlice(...a),
  ...createViewFlagsSlice(...a),
  ...createNerdStatsSlice(...a),
  ...createFullscreenSlice(...a),
  ...createInteriorSlice(...a),
}))

export function useViewFlag<K extends keyof ViewFlags>(key: K): ViewFlags[K] {
  return useUIStore((s) => s.viewFlags[key])
}
