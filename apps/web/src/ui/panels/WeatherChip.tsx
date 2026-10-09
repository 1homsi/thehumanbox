import clsx from 'clsx'
import type { WorldState } from '../../shared/types'
import { Tooltip } from '../toolbar/Tooltip'
import { ToolSprite } from '../toolbar/ToolSprite'
import { weatherConditions } from './weather-conditions'

type WeatherWorld = Pick<WorldState, 'weather' | 'drought'>

/**
 * Rain, storm and drought in one icon-only chip. The chip takes the tint of the most
 * severe condition (storm, then drought, then rain); the tooltip names each one.
 */
export function WeatherChip({ world }: { world: WeatherWorld }) {
  const conditions = weatherConditions(world)
  if (conditions.length === 0) return null
  const severe =
    conditions.find((c) => c.key === 'storm') ?? conditions.find((c) => c.key === 'drought') ?? conditions[0]!
  const label = conditions.map((c) => c.title).join(', ')
  const tip = (
    <span className="tip-card">
      {conditions.map((c) => (
        <span key={c.key} className="weather-tip-part">
          <span className="tip-title">{c.title}</span>
          <span className="tip-body">{c.body}</span>
        </span>
      ))}
    </span>
  )
  return (
    <Tooltip tip={tip}>
      <span className={clsx('hdr-chip', 'weather-chip', severe.key)} role="img" aria-label={label}>
        {conditions.map((c) => (
          <ToolSprite key={c.key} icon={c.icon} size={16} />
        ))}
      </span>
    </Tooltip>
  )
}
