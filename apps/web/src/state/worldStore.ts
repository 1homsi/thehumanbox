import { create } from 'zustand'
import type { OrganismState, WorldState } from '../shared/types'
import { recordPopulations, type PopHistory } from '../game/model/pop-history'

/** Each tribe's headcount over time, sampled as snapshots arrive. */
export const popHistory: PopHistory = new Map()
const popSampling = { lastTick: -Infinity }

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
