import { t } from '../../../i18n'
import type { WorldState } from '../../../shared/types'

/**
 * The stage of life the simulation puts a person in. It counts a lifespan (`max_age`) in shares: under
 * 35% is young (infant, child or teen), 35% to 75% an adult, and 75% on an elder.
 */
function lifeStage(
  o: Pick<WorldState['organisms'][number], 'age' | 'max_age' | 'is_elder'>,
): 'young' | 'adult' | 'elder' {
  if (!(o.max_age > 0)) {
    // A frame without lifespans cannot place anyone by share; fall back to the tribe's eldest and to age in ticks.
    return o.is_elder ? 'elder' : o.age < 900 ? 'young' : 'adult'
  }
  const share = o.age / o.max_age
  if (share < 0.35) return 'young'
  if (share < 0.75) return 'adult'
  return 'elder'
}

export function AgePyramid({ organisms }: { organisms: WorldState['organisms'] }) {
  let cm = 0,
    cf = 0,
    am = 0,
    af = 0,
    em = 0,
    ef = 0
  for (const o of organisms) {
    const isMale = o.sex === 'male'
    const stage = lifeStage(o)
    if (stage === 'elder') {
      if (isMale) em++
      else ef++
    } else if (stage === 'young') {
      if (isMale) cm++
      else cf++
    } else {
      if (isMale) am++
      else af++
    }
  }
  const max = Math.max(cm + cf, am + af, em + ef, 1)
  const row = (label: string, m: number, f: number) => (
    <div className="age-row" key={label}>
      <span className="age-label">{label}</span>
      <div className="age-bar-pair">
        <div className="age-bar age-bar-m" style={{ width: `${(m / max) * 100}%` }}>
          {m > 0 && m}
        </div>
        <div className="age-bar age-bar-f" style={{ width: `${(f / max) * 100}%` }}>
          {f > 0 && f}
        </div>
      </div>
    </div>
  )
  return (
    <div className="age-pyramid">
      {row(t('dialogs.life.elder'), em, ef)}
      {row(t('dialogs.stats.ageAdult'), am, af)}
      {row(t('person.kin.child'), cm, cf)}
    </div>
  )
}
