// How a person's death is worded on their card. The simulation records the
// cause when the person dies (crates/sim-core/src/sim/simulation/organism_tick/
// mortality.rs), as "starvation", "combat", "old age" and so on.

import { formatNumber, t } from '../../i18n'

/** The sentence for a dead person's card, or null while they are alive or the cause is unknown. */
export function deathLine(org: { alive: boolean; death_cause?: string; age: number }): string | null {
  if (org.alive || !org.death_cause) return null
  return t('model.death.line', { cause: org.death_cause, age: formatNumber(org.age) })
}
