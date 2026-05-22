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

export const createViewFlagsSlice: StateCreator<UIState, [], [], ViewFlagsSlice> = (set) => ({
  viewFlags: DEFAULTS,
  setViewFlag: (k, v) =>
    set((s) => {
      if (s.viewFlags[k] === v) return s
      return { viewFlags: { ...s.viewFlags, [k]: v } }
    }),
})
