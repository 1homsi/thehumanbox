import { useState } from 'react'
import { useCameraFocus } from '../stores/camera-focus'
import { useUIStore } from '../stores/store'
import type { WorldState } from '../types'
import { PERIL_HELP, remainingLine, tribeHome } from '../world/tribe-peril'
import { Tooltip } from './Tooltip'

interface Props {
  world: WorldState
}

/**
 * A red header chip while any tribe is on the brink. Each click goes to the
 * next one: the camera flies there and its card opens with the help it needs.
 */
export function PerilChip({ world }: Props) {
  const perils = [...(world.tribes_in_peril ?? [])].sort((a, b) => a.population - b.population)
  const [next, setNext] = useState(0)
  const setFocus = useUIStore((s) => s.setFocus)
  const focusTile = useCameraFocus((s) => s.focusTile)
  if (perils.length === 0) return null
  const lead = perils[0]!
  const tip =
    perils.length === 1
      ? `The ${lead.tribe} are on the brink: ${remainingLine(lead.population)}, ${PERIL_HELP[lead.cause].reason}.`
      : `${perils.length} tribes are on the brink. Click to go to each in turn.`
  return (
    <Tooltip
      tip={
        <span className="tip-card">
          <strong>on the brink</strong>
          <span>{tip}</span>
        </span>
      }
    >
      <button
        className="hdr-chip peril-chip"
        aria-label={perils.length === 1 ? '1 tribe on the brink' : `${perils.length} tribes on the brink`}
        onClick={() => {
          const peril = perils[next % perils.length]!
          setNext((n) => n + 1)
          setFocus(`lineage:${peril.lineage_id}`)
          const home = tribeHome(world, peril.lineage_id)
          if (home) focusTile(Math.round(home.x), Math.round(home.y))
        }}
      >
        ⚠ {perils.length}
      </button>
    </Tooltip>
  )
}
