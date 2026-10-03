import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { loadBool, saveBool } from '../../persistence'

const NERD_KEY = 'thb-nerd-stats'

export interface NerdStatsSlice {
  nerdStats: boolean
  setNerdStats: (b: boolean) => void
}

export const createNerdStatsSlice: StateCreator<UIState, [], [], NerdStatsSlice> = (set) => ({
  nerdStats: loadBool(NERD_KEY, false),
  setNerdStats: (b) => {
    saveBool(NERD_KEY, b)
    set({ nerdStats: b })
  },
})
