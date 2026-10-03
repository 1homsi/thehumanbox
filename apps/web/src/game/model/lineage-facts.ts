import type { WorldState } from '../../shared/types'

export interface LineageFacts {
  era?: string
  faith?: number
  government?: string
}

const pretty = (s: string) => s.replace(/[-_]/g, ' ')

/** Each tribe's age, faith and form of government, for the lineage list. */
export function lineageFacts(
  world: Pick<WorldState, 'lineage_eras' | 'faith' | 'governments'>,
): Record<string, LineageFacts> {
  const out: Record<string, LineageFacts> = {}
  const at = (id: string) => (out[id] ??= {})
  const eras = world.lineage_eras
  if (Array.isArray(eras)) for (const e of eras) at(e.lineage_id).era = pretty(e.era_name)
  else if (eras) for (const [id, era] of Object.entries(eras)) at(id).era = pretty(era)
  for (const [id, n] of Object.entries(world.faith?.by_lineage ?? {})) at(id).faith = n
  for (const g of world.governments ?? []) at(g.lineage_id).government = pretty(g.kind)
  return out
}

/** "industrial age · empire · ✧-10", leaving out what is not known. */
export function factsLine(f: LineageFacts | undefined): string {
  if (!f) return ''
  return [f.era ? `${f.era} age` : '', f.government ?? '', f.faith !== undefined ? `✧${f.faith}` : '']
    .filter(Boolean)
    .join(' · ')
}
