import type { WorldState } from '../../shared/types'
import { governmentWord } from '../../shared/government-words'

export interface LineageFacts {
  era?: string
  faith?: number
  government?: string
}

import { t } from '../../i18n'
import { eraWord } from '../../shared/era-words'

/** Each tribe's age, faith and form of government, for the lineage list. */
export function lineageFacts(
  world: Pick<WorldState, 'lineage_eras' | 'faith' | 'governments'>,
): Record<string, LineageFacts> {
  const out: Record<string, LineageFacts> = {}
  const at = (id: string) => (out[id] ??= {})
  const eras = world.lineage_eras
  if (Array.isArray(eras)) for (const e of eras) at(e.lineage_id).era = eraWord(e.era_name)
  else if (eras) for (const [id, era] of Object.entries(eras)) at(id).era = eraWord(era)
  for (const [id, n] of Object.entries(world.faith?.by_lineage ?? {})) at(id).faith = n
  for (const g of world.governments ?? []) at(g.lineage_id).government = governmentWord(g.kind)
  return out
}

/** "industrial age · empire · ✧-10", leaving out what is not known. */
export function factsLine(f: LineageFacts | undefined): string {
  if (!f) return ''
  return [
    f.era ? t('panels.tribe.eraAge', { era: f.era }) : '',
    f.government ?? '',
    f.faith !== undefined ? `✧${f.faith}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
