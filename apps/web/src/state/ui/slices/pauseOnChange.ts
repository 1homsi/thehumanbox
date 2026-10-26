import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { loadBool, loadJson, loadString, saveJson } from '../../persistence'
import { PAUSE_NOTHING, PAUSE_TRIGGERS, type PauseOn, type PauseTrigger } from '../../../game/model/pause-on'

const KEY = 'thb-pause-on'
/** The single switch from before the changes could be chosen one by one: "on the brink". */
const LEGACY_KEY = 'thb-pause-on-peril'

export interface PauseOnChangeSlice {
  /** Which changes stop the clock while the game runs. */
  pauseOn: PauseOn
  setPauseOn: (trigger: PauseTrigger, on: boolean) => void
}

function savedPauseOn(): PauseOn {
  const saved = loadJson<Partial<Record<PauseTrigger, unknown>> | null>(KEY, null)
  if (saved && typeof saved === 'object') {
    const out = { ...PAUSE_NOTHING }
    for (const trigger of PAUSE_TRIGGERS)
      if (typeof saved[trigger] === 'boolean') out[trigger] = saved[trigger]
    return out
  }
  // Players who chose the old switch keep it as "on the brink".
  if (loadString(LEGACY_KEY) !== null) return { ...PAUSE_NOTHING, brink: loadBool(LEGACY_KEY, false) }
  return { ...PAUSE_NOTHING }
}

export const createPauseOnChangeSlice: StateCreator<UIState, [], [], PauseOnChangeSlice> = (set, get) => ({
  pauseOn: savedPauseOn(),
  setPauseOn: (trigger, on) => {
    const next = { ...get().pauseOn, [trigger]: on }
    saveJson(KEY, next)
    set({ pauseOn: next })
  },
})
