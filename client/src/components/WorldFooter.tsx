import { useMemo } from 'react'
import type { WorldState } from '../types'

interface Props {
  world: WorldState
}

const ERA_LABEL: Record<string, string> = {
  genesis:    'GENESIS',
  forager:    'FORAGER',
  fire:       'FIRE',
  shelter:    'SHELTER',
  tribal:     'TRIBAL',
  invention:  'INVENTION',
  cooking:    'COOKING',
  masonry:    'MASONRY',
  equilibrium:'EQUILIBRIUM',
}

/**
 * Bottom of the left sidebar. Surfaces the few derived facts that fit a
 * tight strip: current era, tribal mood (allies vs rivals), and the day
 * cycle. All sourced from world state we already ship - no extra fetches.
 */
export function WorldFooter({ world }: Props) {
  const moodCounts = useMemo(() => {
    let ally = 0, rivals = 0, neutral = 0
    for (const r of world.tribal_relations ?? []) {
      if (r.status === 'ally')   ally++
      else if (r.status === 'rivals') rivals++
      else neutral++
    }
    return { ally, rivals, neutral }
  }, [world.tribal_relations])

  const era = world.current_era ? (ERA_LABEL[world.current_era] ?? world.current_era.toUpperCase()) : '—'
  const dayPct = Math.round((world.day_progress ?? 0) * 100)
  const phase = world.is_day ? 'day' : 'night'
  const weatherKind = world.weather?.kind ?? 'clear'
  const droughtTag = world.drought ? '· drought' : ''

  return (
    <div className="world-footer">
      <div className="footer-row">
        <span className="footer-label">era</span>
        <span className="footer-value era-tag">{era}</span>
      </div>
      <div className="footer-row">
        <span className="footer-label">{phase}</span>
        <div className="footer-bar">
          <div className="footer-bar-fill" style={{ width: `${dayPct}%` }} />
        </div>
      </div>
      <div className="footer-row">
        <span className="footer-label">weather</span>
        <span className="footer-value">{weatherKind}{droughtTag}</span>
      </div>
      <div className="footer-row">
        <span className="footer-label">tribes</span>
        <span className="footer-value mood">
          <span className="mood-ally">{moodCounts.ally}♥</span>
          <span className="mood-neutral">{moodCounts.neutral}·</span>
          <span className="mood-rivals">{moodCounts.rivals}⚔</span>
        </span>
      </div>
    </div>
  )
}
