// Who a person is tied to, for the person card: partner, mother, father,
// children, friends and rivals. Each link carries the other person's id so the
// card can select them. Built only from what the client already has: the ids
// on each person, the friends they name, their trust toward others, and the
// organisms list.

export interface KinPerson {
  id: string
  name: string
  custom_name?: string | null
  alive: boolean
  parent_id?: string | null
  father_id?: string | null
  partner_id?: string | null
}

export interface KinLink {
  id: string
  name: string
  alive: boolean
}

export interface KinLinks {
  partner: KinLink | null
  mother: KinLink | null
  father: KinLink | null
  children: KinLink[]
  friends: KinLink[]
  rivals: KinLink[]
}

const MAX_CHILDREN = 8
const MAX_FRIENDS = 8
const MAX_RIVALS = 4
/** Trust at or below this is a rivalry, the same line the bonds section uses. */
const RIVAL_TRUST = -0.2

export function kinLinks(
  org: KinPerson & { friends?: Record<string, string>; org_trust?: Record<string, number> },
  organisms: ReadonlyArray<KinPerson>,
): KinLinks {
  const byId = new Map(organisms.map((o) => [o.id, o]))
  const link = (id: string | null | undefined, fallbackName?: string): KinLink | null => {
    if (!id) return null
    const o = byId.get(id)
    if (o) return { id, name: o.custom_name?.trim() || o.name, alive: o.alive }
    if (fallbackName) return { id, name: fallbackName, alive: false }
    return null
  }

  const children = organisms
    .filter((o) => o.id !== org.id && (o.parent_id === org.id || o.father_id === org.id))
    .map((o) => link(o.id) as KinLink)
    .slice(0, MAX_CHILDREN)

  const friends = Object.entries(org.friends ?? {})
    .map(([id, name]) => link(id, name))
    .filter((l): l is KinLink => l !== null)
    .slice(0, MAX_FRIENDS)

  const rivals = Object.entries(org.org_trust ?? {})
    .filter(([, v]) => v <= RIVAL_TRUST)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => link(id))
    .filter((l): l is KinLink => l !== null)
    .slice(0, MAX_RIVALS)

  return {
    partner: link(org.partner_id),
    mother: link(org.parent_id),
    father: link(org.father_id),
    children,
    friends,
    rivals,
  }
}

/** True when there is any link worth a section on the card. */
export function hasKin(k: KinLinks): boolean {
  return Boolean(
    k.partner || k.mother || k.father || k.children.length || k.friends.length || k.rivals.length,
  )
}
