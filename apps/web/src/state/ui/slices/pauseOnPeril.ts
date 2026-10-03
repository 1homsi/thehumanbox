import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { loadBool, saveBool } from '../../persistence'

const KEY = 'thb-pause-on-peril'

export interface PauseOnPerilSlice {
  /** Pause the game when a tribe newly falls on the brink. */
  pauseOnPeril: boolean
  setPauseOnPeril: (b: boolean) => void
}

export const createPauseOnPerilSlice: StateCreator<UIState, [], [], PauseOnPerilSlice> = (set) => ({
  pauseOnPeril: loadBool(KEY, false),
  setPauseOnPeril: (b) => {
    saveBool(KEY, b)
    set({ pauseOnPeril: b })
  },
})
