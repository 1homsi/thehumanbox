import type { NextAge } from './tribe-status'

/**
 * What stands between a tribe and its next age, in the order the card lists it. The sim gives the age
 * when every secret is known across the tribe AND the world has the people; this only says what is missing.
 */
export type GuideLine =
  | { kind: 'secrets'; names: string[] }
  | { kind: 'people'; have: number; need: number; short: number }
  | { kind: 'ready' }

export function guideLines(next: NextAge): GuideLine[] {
  const lines: GuideLine[] = []
  if (next.missing.length > 0) lines.push({ kind: 'secrets', names: next.missing })
  // Without the world's totals (an older frame) the people line and the "ready" line are left out: nothing is known about them.
  if (next.worldKnown && next.peopleNeeded > 0) {
    lines.push({
      kind: 'people',
      have: next.worldPeople,
      need: next.worldPeopleRequired,
      short: next.peopleNeeded,
    })
  }
  if (lines.length === 0 && next.worldKnown) lines.push({ kind: 'ready' })
  return lines
}
