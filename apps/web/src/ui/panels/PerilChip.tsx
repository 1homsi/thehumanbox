import { useState } from 'react'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'
import type { WorldState } from '../../shared/types'
import { PERIL_HELP, remainingLine, tribeHome } from '../../game/model/tribe-peril'
import { Tooltip } from '../toolbar/Tooltip'
import { t } from '../../i18n'

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
      ? t('panels.peril.tipOne', {
          tribe: lead.tribe,
          remaining: remainingLine(lead.population),
          reason: t(PERIL_HELP[lead.cause].reason),
        })
      : t('panels.peril.tipMany', { count: perils.length })
  return (
    <Tooltip
      tip={
        <span className="tip-card">
          <strong>{t('panels.peril.title')}</strong>
          <span>{tip}</span>
        </span>
      }
    >
      <button
        className="hdr-chip peril-chip"
        aria-label={t('panels.peril.label', { count: perils.length })}
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
