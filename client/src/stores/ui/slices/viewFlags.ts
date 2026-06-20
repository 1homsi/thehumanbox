import type { StateCreator } from 'zustand'
import type { UIState, ViewFlags } from '../types'
import { trackEvent } from '../../../lib/observability'

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
  randomTour: false,
  slowMo: false,
  fastMo: false,
  colorBlind: false,
  orgPov: false,
  territoryMap: false,
  headlineTicker: false,
}

const TRACKED_FLAGS: Set<keyof ViewFlags> = new Set(['threeD', 'orgPov', 'photoMode', 'randomTour', 'hideUI'])

function initialViewFlags(): ViewFlags {
  if (typeof window === 'undefined') return DEFAULTS
  const params = new URLSearchParams(window.location.search)
  if (params.get('3d') === '1' || params.has('view3d')) {
    return { ...DEFAULTS, threeD: true }
  }
  return DEFAULTS
}

export const createViewFlagsSlice: StateCreator<UIState, [], [], ViewFlagsSlice> = (set) => ({
  viewFlags: initialViewFlags(),
  setViewFlag: (k, v) =>
    set((s) => {
      if (s.viewFlags[k] === v) return s
      if (TRACKED_FLAGS.has(k)) {
        trackEvent('view_flag_toggle', { flag: k as string, value: v })
      }
      return { viewFlags: { ...s.viewFlags, [k]: v } }
    }),
})
