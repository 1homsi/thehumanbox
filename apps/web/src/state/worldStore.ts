import { create } from 'zustand'
import type { OrganismState, WorldState } from '../shared/types'
import { recordPopulations, type PopHistory } from '../game/model/pop-history'

/** Each tribe's headcount over time, sampled as snapshots arrive. */
export const popHistory: PopHistory = new Map()
const popSampling = { lastTick: -Infinity }

// Every tribe name the player has been shown while the tribe lived. The simulation drops a name once no one of
// that tribe is alive, but a stats row can still mention the tribe for a while after that.
const tribeNames = new Map<string, string>()

/** The tribe's name from the current snapshot, else the last one seen for it, else undefined. */
export function knownTribeName(names: Record<string, string> | undefined, id: string): string | undefined {
  return names?.[id] ?? tribeNames.get(id)
}

interface WorldStore {
  world: WorldState | null
  byId: Map<string, OrganismState>
  setWorld: (w: WorldState) => void
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  world: null,
  byId: new Map(),
  setWorld: (world) => {
    recordPopulations(popHistory, popSampling, world)
    for (const [id, name] of Object.entries(world.lineage_names ?? {})) tribeNames.set(id, name)
    // Diff against the previous map: reuse the entries whose
    // reference equals the incoming one, only allocate a new Map
    // when membership actually changed. With the mergeDefined
    // ref-stability shortcut upstream, unchanged orgs keep their
    // identity here, so useOrganism subscribers stop re-rendering
    // when nothing about their org changed.
    const prev = get().byId
    let identical = prev.size === world.organisms.length
    if (identical) {
      for (const o of world.organisms) {
        if (prev.get(o.id) !== o) {
          identical = false
          break
        }
      }
    }
    if (identical) {
      set({ world })
      return
    }
    const byId = new Map<string, OrganismState>()
    for (const o of world.organisms) byId.set(o.id, o)
    set({ world, byId })
  },
}))

export function useOrganism(id: string | null | undefined): OrganismState | undefined {
  return useWorldStore((s) => (id ? s.byId.get(id) : undefined))
}
