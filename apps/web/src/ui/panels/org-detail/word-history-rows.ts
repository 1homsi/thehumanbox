import type { FamilyWords, OrgDetail } from '../../../shared/types'
import type { MessageKey } from '../../../i18n'

/**
 * The common things the sim compares family words for. Must match
 * `FAMILY_WORD_CONCEPTS` in `crates/sim-core/src/organism/family_words.rs`.
 */
export const FAMILY_WORD_CONCEPTS = [
  'food',
  'water',
  'fire',
  'home',
  'friend',
  'sun',
  'river',
  'danger',
] as const

export const RELATION_LABEL: Record<FamilyWords['relation'], MessageKey> = {
  mother: 'person.words.mother',
  father: 'person.words.father',
  maternal_grandmother: 'person.words.maternalGrandmother',
  maternal_grandfather: 'person.words.maternalGrandfather',
  paternal_grandmother: 'person.words.paternalGrandmother',
  paternal_grandfather: 'person.words.paternalGrandfather',
}

export interface WordRelative {
  id: string
  name: string
  relation: FamilyWords['relation']
  remembered: boolean
  /** Their word for the concept, or null when they are not remembered or do not know it. */
  word: string | null
}

export interface WordRow {
  concept: string
  /** The person's own word. */
  own: string
  relatives: WordRelative[]
  /** Some remembered relative says this concept differently from the person. */
  drifted: boolean
}

/**
 * One row per common thing the person knows a word for and at least one
 * remembered relative knows too. Empty when there is no family to compare.
 */
export function wordHistoryRows(
  detail: Pick<OrgDetail, 'vocabulary' | 'family_words'> | null | undefined,
): WordRow[] {
  const family = detail?.family_words ?? []
  if (!detail || !family.some((r) => r.remembered)) return []
  const rows: WordRow[] = []
  for (const concept of FAMILY_WORD_CONCEPTS) {
    const own = detail.vocabulary?.[concept]
    if (!own) continue
    const relatives: WordRelative[] = family.map((r) => ({
      id: r.id,
      name: r.name,
      relation: r.relation,
      remembered: r.remembered,
      word: r.remembered ? (r.vocabulary?.[concept] ?? null) : null,
    }))
    if (!relatives.some((r) => r.word !== null)) continue
    rows.push({
      concept,
      own,
      relatives,
      drifted: relatives.some((r) => r.word !== null && r.word !== own),
    })
  }
  return rows
}
