interface SelectableOrganism {
  id: string
  alive: boolean
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
