import type { WorldState } from '../../types'

export function BondStats({ organisms }: { organisms: WorldState['organisms'] }) {
  let partnered = 0,
    pregnant = 0,
    withKids = 0,
    sick = 0,
    hungry = 0,
    thirsty = 0
  for (const o of organisms) {
    if (o.partner_id) partnered++
    if (o.pregnant) pregnant++
    if ((o.children_count ?? 0) > 0) withKids++
    if (o.infection > 0.15) sick++
    if (o.energy < 0.3) hungry++
    if (o.hydration < 0.3) thirsty++
  }
  const n = organisms.length || 1
  const pct = (x: number) => `${Math.round((x / n) * 100)}%`
  return (
    <div className="stats-death-grid">
      <span className="hist-label">partnered</span>{' '}
      <span className="hist-val">
        {partnered} ({pct(partnered)})
      </span>
      <span className="hist-label">pregnant</span> <span className="hist-val">{pregnant}</span>
      <span className="hist-label">with kids</span> <span className="hist-val">{withKids}</span>
      <span className="hist-label">sick</span> <span className="hist-val">{sick}</span>
      <span className="hist-label">hungry</span> <span className="hist-val">{hungry}</span>
      <span className="hist-label">thirsty</span> <span className="hist-val">{thirsty}</span>
    </div>
  )
}
