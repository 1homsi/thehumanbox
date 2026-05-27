import type { StateCreator } from 'zustand'
import type { UIState, ViewFlags } from '../types'

export interface ViewFlagsSlice {
  viewFlags: ViewFlags
  setViewFlag: (k: keyof ViewFlags, v: boolean) => void
}

const DEFAULTS: ViewFlags = {
  territory: false,
  names: true,
  thoughts: false,
  animals: true,
  grid: false,
  trails: false,
  structures: false,
  fertility: false,
  hazard: false,
  lineageDot: false,
  health: false,
  age: false,
  fear: false,
  partners: false,
  pregnancy: false,
  history: false,
  fps: false,
  threeD: false,
  hideUI: false,
  photoMode: false,
  actionTicker: false,
  randomTour: false,
  slowMo: false,
  fastMo: false,
  colorBlind: false,
  orgPov: false,
  territoryMap: false,
}

const TRACKED_FLAGS: Set<keyof ViewFlags> = new Set([
  'threeD',
  'orgPov',
  'photoMode',
  'randomTour',
  'hideUI',
])

export const createViewFlagsSlice: StateCreator<UIState, [], [], ViewFlagsSlice> = (set) => ({
  viewFlags: DEFAULTS,
  setViewFlag: (k, v) =>
    set((s) => {
      if (s.viewFlags[k] === v) return s
      if (TRACKED_FLAGS.has(k)) {
        import('../../../lib/analytics').then((m) =>
          m.trackEvent('view_flag_toggle', { flag: k as string, value: v }),
        )
      }
      return { viewFlags: { ...s.viewFlags, [k]: v } }
    }),
})
