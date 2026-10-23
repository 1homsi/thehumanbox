import { personName } from '../../../shared/personName'
import type { WorldState } from '../../../shared/types'
import { lineageColor } from '../../../shared/constants'
import { DAY_LENGTH } from './constants'
import { formatNumber, t } from '../../../i18n'

export function NotableOrgs({ organisms }: { organisms: WorldState['organisms'] }) {
  if (organisms.length === 0) return null
  const byAge = [...organisms].sort((a, b) => b.age - a.age).slice(0, 3)
  const byKids = [...organisms].sort((a, b) => (b.children_count ?? 0) - (a.children_count ?? 0)).slice(0, 3)
  const byGen = [...organisms].sort((a, b) => b.generation - a.generation).slice(0, 3)
  const row = (
    label: string,
    list: WorldState['organisms'],
    pick: (o: WorldState['organisms'][number]) => string,
  ) => (
    <div className="notable-row" key={label}>
      <span className="notable-label">{label}</span>
      <span className="notable-list">
        {list.map((o) => (
          <span key={o.id} className="notable-entry" style={{ color: lineageColor(o.lineage_id) }}>
            {personName(o)} <span style={{ color: '#666' }}>{pick(o)}</span>
          </span>
        ))}
      </span>
    </div>
  )
  return (
    <div className="notable-grid">
      {row(t('dialogs.stats.notable.oldest'), byAge, (o) =>
        t('dialogs.stats.notable.days', { days: formatNumber(Math.floor(o.age / DAY_LENGTH)) }),
      )}
      {row(t('dialogs.stats.notable.parents'), byKids, (o) =>
        t('dialogs.stats.notable.kids', { count: formatNumber(o.children_count ?? 0) }),
      )}
      {row(t('dialogs.stats.notable.deepestGen'), byGen, (o) =>
        t('dialogs.stats.notable.gen', { gen: formatNumber(o.generation) }),
      )}
    </div>
  )
}
