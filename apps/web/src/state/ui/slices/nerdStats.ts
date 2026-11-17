import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { loadBool, saveBool } from '../../persistence'
import { trackEvent } from '../../../shared/observability'

const NERD_KEY = 'thb-nerd-stats'

export interface NerdStatsSlice {
  nerdStats: boolean
  setNerdStats: (b: boolean) => void
}

export const createNerdStatsSlice: StateCreator<UIState, [], [], NerdStatsSlice> = (set, get) => ({
  nerdStats: loadBool(NERD_KEY, false),
  setNerdStats: (b) => {
    if (get().nerdStats === b) return
    saveBool(NERD_KEY, b)
    set({ nerdStats: b })
    trackEvent('nerd_stats_toggle', { on: b })
  },
})
