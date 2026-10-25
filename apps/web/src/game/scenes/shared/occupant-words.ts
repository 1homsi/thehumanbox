import { t, type MessageKey } from '../../../i18n'
import type { OccupantRole } from '../core/types'

// The word a scene chip shows for each role. The simulation never sends these; the scene picks them.
const ROLE_KEYS: Record<OccupantRole, MessageKey> = {
  host: 'panels.scene.role.host',
  partner: 'panels.scene.role.partner',
  child: 'panels.scene.role.child',
  kin: 'panels.scene.role.kin',
  guest: 'panels.scene.role.guest',
  stranger: 'panels.scene.role.stranger',
  patron: 'panels.scene.role.patron',
  worshipper: 'panels.scene.role.worshipper',
  brewer: 'panels.scene.role.brewer',
  priest: 'panels.scene.role.priest',
}

/** A scene occupant's role in the active language, e.g. "Stammgast" for a patron in German. */
export function roleWord(role: OccupantRole): string {
  return t(ROLE_KEYS[role])
}
