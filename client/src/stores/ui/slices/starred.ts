import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { loadJson, saveJson } from '../../persistence'

const STARRED_KEY = 'thb-starred-orgs'

function loadStarred(): string[] {
  const arr = loadJson<unknown>(STARRED_KEY, [])
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
}

function saveStarred(ids: string[]): void {
  saveJson(STARRED_KEY, ids)
}

export interface StarredSlice {
  starredOrgIds:   string[]
  showStarredOnly: boolean
  toggleStar:            (id: string) => void
  toggleShowStarredOnly: () => void
}

export const createStarredSlice: StateCreator<UIState, [], [], StarredSlice> = (set) => ({
  starredOrgIds:   loadStarred(),
  showStarredOnly: false,
  toggleStar: (id) => set((s) => {
    const has  = s.starredOrgIds.includes(id)
    const next = has ? s.starredOrgIds.filter((x) => x !== id) : [...s.starredOrgIds, id]
    saveStarred(next)
    return { starredOrgIds: next }
  }),
  toggleShowStarredOnly: () => set((s) => ({ showStarredOnly: !s.showStarredOnly })),
})
