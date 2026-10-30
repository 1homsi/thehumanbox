import { create } from 'zustand'
import { loadBool, loadJson, saveBool, saveJson } from './persistence'

const FOLLOWED_KEY = 'thb-followed-tribes'
const WARN_FOLLOWED_KEY = 'thb-warn-followed-only'

/** Keeps the followed tribe ids as a list of strings; anything else in storage is ignored. */
function savedFollowed(): string[] {
  const saved = loadJson<unknown>(FOLLOWED_KEY, [])
  return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
}

interface TribeFollowState {
  /** The lineage ids of the tribes the player follows. */
  followed: string[]
  /** Only followed tribes get detailed famine warnings (the map tint is shown for every tribe). */
  warnFollowedOnly: boolean
  toggleFollow: (lineage: string) => void
  setWarnFollowedOnly: (on: boolean) => void
}

/** Tribes the player follows, and whether warnings are limited to them. Kept in this browser only. */
export const useTribeFollow = create<TribeFollowState>((set, get) => ({
  followed: savedFollowed(),
  warnFollowedOnly: loadBool(WARN_FOLLOWED_KEY, false),
  toggleFollow: (lineage) => {
    const current = get().followed
    const next = current.includes(lineage) ? current.filter((id) => id !== lineage) : [...current, lineage]
    saveJson(FOLLOWED_KEY, next)
    set({ followed: next })
  },
  setWarnFollowedOnly: (on) => {
    saveBool(WARN_FOLLOWED_KEY, on)
    set({ warnFollowedOnly: on })
  },
}))
