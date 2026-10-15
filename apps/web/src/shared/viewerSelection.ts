interface SelectableOrganism {
  id: string
  alive: boolean
  lineage_id?: string
}

interface ViewerSelectionWorld {
  organisms: readonly SelectableOrganism[]
  featured_org_id?: string
}

/** Keep explicit live selections without turning editorial "featured" data into UI state. */
export function reconcileViewerSelection(
  selectedOrgId: string | null,
  world: ViewerSelectionWorld,
): string | null {
  if (!selectedOrgId) return null
  return world.organisms.some((org) => org.id === selectedOrgId && org.alive) ? selectedOrgId : null
}

/** A tribe focus dims the whole map but its members: when the tribe has no living member left, fall back to everyone. */
export function reconcileFocus(focus: string, world: ViewerSelectionWorld): string {
  if (!focus.startsWith('lineage:')) return focus
  const lineage = focus.slice('lineage:'.length)
  return world.organisms.some((org) => org.alive && org.lineage_id === lineage) ? focus : 'all'
}
