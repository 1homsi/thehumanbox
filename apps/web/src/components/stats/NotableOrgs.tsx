import type { WorldState } from '../../types'
import { lineageColor } from '../../utils/constants'
import { DAY_LENGTH } from './constants'

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
            {o.name} <span style={{ color: '#666' }}>{pick(o)}</span>
          </span>
        ))}
      </span>
    </div>
  )
  return (
    <div className="notable-grid">
      {row('oldest', byAge, (o) => `· ${Math.floor(o.age / DAY_LENGTH)}d`)}
      {row('parents', byKids, (o) => `· ${o.children_count ?? 0} kids`)}
      {row('deepest gen', byGen, (o) => `· g${o.generation}`)}
    </div>
  )
}
