import { useMemo } from 'react'
import type { WorldState } from '../types'
import { lineageColor } from '../constants'
import { useUIStore } from '../store'

/**
 * Bottom-of-screen marquee showing the live thought of each alive
 * organism. Updates whenever the world prop changes (i.e., every WS
 * snapshot). The track is duplicated so the CSS animation can loop
 * seamlessly.
 */
export function ActionTicker({ world }: { world: WorldState }) {
  const selectOrg = useUIStore(s => s.selectOrg)

  const items = useMemo(() => {
    return world.organisms
      .filter(o => o.alive && o.thought && o.thought.length > 0)
      .slice(0, 60)
      .map(o => ({
        id: o.id,
        name: o.name,
        thought: o.thought,
        color: lineageColor(o.lineage_id),
      }))
  }, [world])

  if (items.length === 0) return null

  return (
    <div className="thb-action-ticker">
      <div className="thb-action-ticker-track">
        {[...items, ...items].map((it, i) => (
          <button
            key={`${it.id}-${i}`}
            className="thb-action-ticker-item"
            onClick={() => selectOrg(it.id)}
            title={`Select ${it.name}`}
          >
            <span className="thb-action-ticker-name" style={{ color: it.color }}>
              {it.name}
            </span>
            <span className="thb-action-ticker-thought">{it.thought}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
