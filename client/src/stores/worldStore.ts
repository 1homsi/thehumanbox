import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { OrganismState, WorldState } from '../types'

interface WorldStore {
  world: WorldState | null
  byId: Map<string, OrganismState>
  setWorld: (w: WorldState) => void
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  world: null,
  byId: new Map(),
  setWorld: (world) => {
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

export function useLiveOrganismIds(): string[] {
  return useWorldStore(
    useShallow((s) => {
      if (!s.world) return [] as string[]
      const out: string[] = []
      for (const o of s.world.organisms) if (o.alive) out.push(o.id)
      return out
    }),
  )
}
