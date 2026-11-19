import type { TownInfo, TownRole, WorldState } from '../../shared/types'
import { t, type MessageKey } from '../../i18n'
import { goodWord } from '../../ui/sim-words'

const TOWN_REACH = 30

const ROLE_KEYS: Record<TownRole, MessageKey> = {
  mixed: 'model.town.role.mixed',
  farming: 'model.town.role.farming',
  harbour: 'model.town.role.harbour',
  mining: 'model.town.role.mining',
  timber: 'model.town.role.timber',
  trade: 'model.town.role.trade',
  capital: 'model.town.role.capital',
}

export function townRoleWord(role: TownRole | undefined): string | null {
  return role ? t(ROLE_KEYS[role] ?? ROLE_KEYS.mixed) : null
}

export function townNear(
  world: Pick<WorldState, 'towns'>,
  lineage: string,
  x: number,
  y: number,
  reach = TOWN_REACH,
): TownInfo | null {
  let best: TownInfo | null = null
  let bestGap = Infinity
  for (const town of world.towns ?? []) {
    if (town.lineage_id !== lineage) continue
    const gap = Math.max(Math.abs(town.center[0] - x), Math.abs(town.center[1] - y))
    if (gap > reach) continue
    if (gap < bestGap || (gap === bestGap && best && town.id < best.id)) {
      best = town
      bestGap = gap
    }
  }
  return best
}

export function townLine(town: TownInfo | null): string | null {
  if (!town) return null
  const role = townRoleWord(town.role)
  if (!role) return null
  const parts = [role]
  const list = (goods: string[] | undefined) => (goods ?? []).map(goodWord).join(', ')
  if (town.short?.length) parts.push(t('model.town.short', { goods: list(town.short) }))
  if (town.spare?.length) parts.push(t('model.town.spare', { goods: list(town.spare) }))
  return parts.join(' · ')
}
