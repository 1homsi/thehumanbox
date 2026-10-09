// How long the dead of the world lived, for the stats panel. A person who dies of
// old age carries `death_cause` "old age" (sim/simulation/organism_tick/mortality.rs),
// and every age is in ticks.

import { ageInYears } from './calendar'

export interface LongestLife {
  name: string
  lineage_id: string
  age: number
}

export interface Longevity {
  /** Old-age deaths counted. */
  deaths: number
  /** The longest life so far, or null while nobody has died of old age. */
  longest: LongestLife | null
  /** The average age at old-age death, in ticks, or null while there are none. */
  averageAge: number | null
}

interface DeadPerson {
  alive: boolean
  age: number
  name: string
  custom_name?: string | null
  lineage_id?: string
  death_cause?: string
}

/** Old-age deaths in the world: how many, the longest life, and the average age at death. */
export function longevityOf(organisms: ReadonlyArray<DeadPerson>): Longevity {
  let deaths = 0
  let total = 0
  let longest: LongestLife | null = null
  for (const o of organisms) {
    if (o.alive || o.death_cause !== 'old age') continue
    deaths += 1
    total += o.age
    if (!longest || o.age > longest.age) {
      longest = {
        name: o.custom_name?.trim() || o.name,
        lineage_id: o.lineage_id ?? '',
        age: o.age,
      }
    }
  }
  return {
    deaths,
    longest,
    averageAge: deaths === 0 ? null : total / deaths,
  }
}

/** "longest life 78 yrs (Ara, Sabami)" and "average 61 yrs over 14 old-age deaths". */
export function longevityLines(longevity: Longevity, lineageName: (lineage: string) => string): string[] {
  const { longest, averageAge, deaths } = longevity
  if (deaths === 0 || !longest || averageAge === null) return []
  return [
    `longest life ${ageInYears(longest.age)} (${longest.name}, ${lineageName(longest.lineage_id)})`,
    `average ${ageInYears(averageAge)} over ${deaths} old-age ${deaths === 1 ? 'death' : 'deaths'}`,
  ]
}
