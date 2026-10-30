import { useEffect, useRef, useState } from 'react'
import type { WorldState } from '../../shared/types'
import { t } from '../../i18n'
import { type FamineStage, type FamineWatch, watchFamine } from '../../game/model/famine-warning'
import { tribeHome } from '../../game/model/tribe-peril'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'
import { useTribeFollow } from '../../state/tribe-follow'
import { knownTribeName } from '../../state/worldStore'
import { screenBusy, TOAST_RETRY_MS } from './screenBusy'
import './famine-toast.css'

/** How long a warning stays up before it goes away on its own. */
export const FAMINE_SHOW_MS = 12_000
/** Warnings waiting for a free screen; the oldest drop off first. */
const MAX_QUEUED = 5

interface Queued {
  id: number
  lineage: string
  stage: FamineStage
}

const STAGE_KEYS = {
  risk: 'panels.famine.risk',
  losing: 'panels.famine.losing',
  gone: 'panels.famine.gone',
} as const

/**
 * Escalating famine warnings for tribes: at risk, losing people, then gone. Each names its tribe and a click
 * takes the camera to it and opens its card. Warnings wait for an empty screen, like the other notices. With
 * "warn only about followed tribes" on, only the tribes the player follows are warned about.
 */
export function FamineWarningToast({ world }: { world: WorldState | null }) {
  const watch = useRef<FamineWatch | null>(null)
  const latest = useRef<WorldState | null>(world)
  latest.current = world
  const [queue, setQueue] = useState<Queued[]>([])
  const [, setTick] = useState(0)
  const nextId = useRef(1)

  // Look at the world each time it changes; warnings join the queue.
  useEffect(() => {
    if (!world) return
    const result = watchFamine(watch.current, world)
    watch.current = result.watch
    const { warnFollowedOnly, followed } = useTribeFollow.getState()
    const due = result.warnings.filter((w) => !warnFollowedOnly || followed.includes(w.lineage))
    if (due.length === 0) return
    setQueue((q) =>
      [...q, ...due.map((w) => ({ id: nextId.current++, lineage: w.lineage, stage: w.stage }))].slice(
        -MAX_QUEUED,
      ),
    )
  }, [world])

  // A warning that is due waits while the screen is busy; a look again happens on a timer.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), TOAST_RETRY_MS)
    return () => window.clearInterval(timer)
  }, [])

  const shown = queue[0] && !screenBusy() ? queue[0] : null

  // The shown warning goes away on its own after a while.
  useEffect(() => {
    if (!shown) return
    const id = shown.id
    const timer = window.setTimeout(() => setQueue((q) => q.filter((x) => x.id !== id)), FAMINE_SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [shown])

  if (!shown) return null
  const name = knownTribeName(world?.lineage_names, shown.lineage) ?? shown.lineage.slice(0, 6)
  const dismiss = () => setQueue((q) => q.filter((x) => x.id !== shown.id))
  const goTo = () => {
    const current = latest.current
    if (current) {
      const home = tribeHome(current, shown.lineage)
      if (home) useCameraFocus.getState().focusTile(Math.round(home.x), Math.round(home.y))
    }
    useUIStore.getState().setFocus(`lineage:${shown.lineage}`)
    dismiss()
  }

  return (
    <div className={`famine-toast famine-${shown.stage}`} role="status" aria-live="polite">
      <span className="famine-toast-text">{t(STAGE_KEYS[shown.stage], { name })}</span>
      <button className="famine-toast-go" onClick={goTo}>
        {t('panels.famine.go', { name })}
      </button>
      <button className="famine-toast-close" aria-label={t('panels.famine.dismiss')} onClick={dismiss}>
        ×
      </button>
    </div>
  )
}
