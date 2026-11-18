import type { Building } from '../../../../shared/types'

export type OwnerReason = 'town' | 'scenery' | 'stray' | 'fading' | 'ruin'

export function ownerReason(b: Building): OwnerReason {
  if (b.ruined) return 'ruin'
  if (b.town != null) return b.decorative ? 'scenery' : 'town'
  return (b.damage ?? 0) > 0 ? 'fading' : 'stray'
}

export const OWNER_COLOURS: Record<OwnerReason, string> = {
  town: 'rgba(80,200,120,0.45)',
  scenery: 'rgba(90,170,255,0.45)',
  stray: 'rgba(240,60,60,0.6)',
  fading: 'rgba(255,165,40,0.55)',
  ruin: 'rgba(120,120,120,0.45)',
}
