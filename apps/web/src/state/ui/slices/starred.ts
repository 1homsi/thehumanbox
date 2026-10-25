import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { loadJson, saveJson } from '../../persistence'

const STARRED_KEY = 'thb-starred-orgs'

interface StarredRecord {
  /** The world the stars were made in: the simulation's world seed, or '' when there is none. */
  world: string
  ids: string[]
}

/**
 * Stars are kept with the world they belong to. Ids are unique to one world, so a star from an
 * earlier world would otherwise read as a person who vanished from this one. Older saves held a
 * bare list of ids; those have no world yet and are adopted by the first world that starts.
 */
function loadStarred(): StarredRecord {
  const raw = loadJson<unknown>(STARRED_KEY, [])
  if (Array.isArray(raw)) {
    return { world: '', ids: raw.filter((x): x is string => typeof x === 'string') }
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as Partial<StarredRecord>
    return {
      world: typeof rec.world === 'string' ? rec.world : '',
      ids: Array.isArray(rec.ids) ? rec.ids.filter((x): x is string => typeof x === 'string') : [],
    }
  }
  return { world: '', ids: [] }
}

function saveStarred(record: StarredRecord): void {
  saveJson(STARRED_KEY, record)
}

export interface StarredSlice {
  starredOrgIds: string[]
  /** The world the starred people belong to. */
  starredWorld: string
  showStarredOnly: boolean
  toggleStar: (id: string) => void
  toggleShowStarredOnly: () => void
  /** Called when a world starts: keeps the stars if they were made in it, and clears them otherwise. */
  bindStarredWorld: (world: string) => void
}

export const createStarredSlice: StateCreator<UIState, [], [], StarredSlice> = (set, get) => {
  const initial = loadStarred()
  return {
    starredOrgIds: initial.ids,
    starredWorld: initial.world,
    showStarredOnly: false,
    toggleStar: (id) =>
      set((s) => {
        const has = s.starredOrgIds.includes(id)
        const next = has ? s.starredOrgIds.filter((x) => x !== id) : [...s.starredOrgIds, id]
        saveStarred({ world: s.starredWorld, ids: next })
        return { starredOrgIds: next }
      }),
    toggleShowStarredOnly: () => set((s) => ({ showStarredOnly: !s.showStarredOnly })),
    bindStarredWorld: (world) => {
      const { starredWorld, starredOrgIds } = get()
      if (world === starredWorld) return
      // Stars saved before any world was recorded (world '') belong to the first world that starts.
      if (starredWorld === '') {
        saveStarred({ world, ids: starredOrgIds })
        set({ starredWorld: world })
        return
      }
      saveStarred({ world, ids: [] })
      set({ starredWorld: world, starredOrgIds: [] })
    },
  }
}
