/**
 * Zustand store for the live world snapshot.
 *
 * Why this exists separate from useUIStore:
 * - `world` changes ~2 Hz (REACT_THROTTLE_MS in useSimulation), and we
 *   want components to subscribe by narrow selector so a change to e.g.
 *   `world.events` doesn't re-render a card that only reads `org.energy`.
 * - UI state (panels open, focus mode, view flags) is orthogonal and
 *   updates at human-click rate. Keeping them in different stores means
 *   neither's subscribers churn on the other's updates.
 *
 * The recommended consumption pattern is fine-grained selectors:
 *
 *   const tick   = useWorldStore(s => s.world?.tick ?? 0)
 *   const events = useWorldStore(s => s.world?.events)
 *   const org    = useOrganism(id)
 *
 * Avoid `useWorldStore(s => s.world)` — it returns a new reference on
 * every WS frame and forces a re-render even when the field you care
 * about didn't change.
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { OrganismState, WorldState } from '../types'

interface WorldStore {
  world: WorldState | null
  /** Map of id -> organism for O(1) selector lookups. Rebuilt from
   *  world.organisms on each setWorld. */
  byId: Map<string, OrganismState>
  setWorld: (w: WorldState) => void
}

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  byId:  new Map(),
  setWorld: (world) => {
    const byId = new Map<string, OrganismState>()
    for (const o of world.organisms) byId.set(o.id, o)
    set({ world, byId })
  },
}))

/** Select a single organism by id. Returns the same reference until that
 *  org's fields change, so consumers wrapped in React.memo won't re-render
 *  for unrelated updates. */
export function useOrganism(id: string | null | undefined): OrganismState | undefined {
  return useWorldStore((s) => (id ? s.byId.get(id) : undefined))
}

/** Stable list of live organism ids. Recomputed each setWorld but only
 *  triggers re-render when the membership (or order) changes. */
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
