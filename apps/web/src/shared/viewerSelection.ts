interface SelectableOrganism {
  id: string
  alive: boolean
  lineage_id?: string
}

interface ViewerSelectionWorld {
  organisms: readonly SelectableOrganism[]
  featured_org_id?: string
  lineage_sizes?: readonly { id: string; count: number }[]
  tribes_in_peril?: readonly { lineage_id: string }[]
}

/** Keep explicit live selections without turning editorial "featured" data into UI state. */
export function reconcileViewerSelection(
  selectedOrgId: string | null,
  world: ViewerSelectionWorld,
): string | null {
  if (!selectedOrgId) return null
  return world.organisms.some((org) => org.id === selectedOrgId && org.alive) ? selectedOrgId : null
}

/**
 * A tribe focus dims the whole map but its members: when the tribe has no living member left, fall back to everyone.
 * `lineage_id` only arrives on the periodic deep frames, so a freshly born member may not carry it yet: the
 * server's tribe census (sizes, peril list) also counts as alive.
 */
export function reconcileFocus(focus: string, world: ViewerSelectionWorld): string {
  if (!focus.startsWith('lineage:')) return focus
  const lineage = focus.slice('lineage:'.length)
  const alive =
    world.organisms.some((org) => org.alive && org.lineage_id === lineage) ||
    world.lineage_sizes?.some((l) => l.id === lineage && l.count > 0) ||
    world.tribes_in_peril?.some((p) => p.lineage_id === lineage)
  return alive ? focus : 'all'
}
