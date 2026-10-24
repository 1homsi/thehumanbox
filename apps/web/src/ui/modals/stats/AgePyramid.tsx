import { t } from '../../../i18n'
import type { WorldState } from '../../../shared/types'

export function AgePyramid({ organisms }: { organisms: WorldState['organisms'] }) {
  let cm = 0,
    cf = 0,
    am = 0,
    af = 0,
    em = 0,
    ef = 0
  for (const o of organisms) {
    const isMale = o.sex === 'male'
    const isElder = o.is_elder || o.age >= 3600
    if (isElder) {
      if (isMale) em++
      else ef++
    } else if (o.age < 900) {
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
