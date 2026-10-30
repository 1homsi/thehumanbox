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
  tribe_chronicle?: Readonly<Record<string, readonly { kind: string }[]>>
}

const LIVING = 'lineage:'
const FALLEN = 'fallen:'

/** Keep explicit live selections without turning editorial "featured" data into UI state. */
export function reconcileViewerSelection(
  selectedOrgId: string | null,
  world: ViewerSelectionWorld,
): string | null {
  if (!selectedOrgId) return null
  return world.organisms.some((org) => org.id === selectedOrgId && org.alive) ? selectedOrgId : null
}

/**
 * Whether a tribe has anyone alive. `lineage_id` only arrives on the periodic deep frames, so a freshly born
 * member may not carry it yet: the server's tribe census (sizes, peril list) also counts as alive.
 */
function tribeAlive(lineage: string, world: ViewerSelectionWorld): boolean {
  return (
    world.organisms.some((org) => org.alive && org.lineage_id === lineage) ||
    !!world.lineage_sizes?.some((l) => l.id === lineage && l.count > 0) ||
    !!world.tribes_in_peril?.some((p) => p.lineage_id === lineage)
  )
}

/**
 * The focus that opens a tribe's card. A living tribe's (`lineage:`) also picks its people out on the map; a
 * tribe that died out gets `fallen:`, which opens its card of how it ended and leaves the map as it is, since
 * there is no one left to pick out.
 */
export function tribeFocus(lineage: string, world: ViewerSelectionWorld): string {
  const fallen =
    !tribeAlive(lineage, world) && !!world.tribe_chronicle?.[lineage]?.some((r) => r.kind === 'extinct')
  return (fallen ? FALLEN : LIVING) + lineage
}

/** The focus for the card of a tribe known to have died out. */
export function fallenFocus(lineage: string): string {
  return FALLEN + lineage
}

/** The tribe whose card a focus opens, living or fallen, or null for any other focus. */
export function focusedTribe(focus: string): string | null {
  if (focus.startsWith(LIVING)) return focus.slice(LIVING.length)
  if (focus.startsWith(FALLEN)) return focus.slice(FALLEN.length)
  return null
}

/**
 * A tribe focus dims the whole map but its members: when the tribe has no living member left, fall back to
 * everyone. A fallen tribe's card (`fallen:`) dims nothing and stays open until it is closed.
 */
export function reconcileFocus(focus: string, world: ViewerSelectionWorld): string {
  if (!focus.startsWith(LIVING)) return focus
  return tribeAlive(focus.slice(LIVING.length), world) ? focus : 'all'
}
