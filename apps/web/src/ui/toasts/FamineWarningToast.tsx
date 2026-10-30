import { useEffect, useRef, useState } from 'react'
import type { WorldState } from '../../shared/types'
import { t } from '../../i18n'
import {
  enqueueFamine,
  type FamineWatch,
  type QueuedFamine,
  watchFamine,
} from '../../game/model/famine-warning'
import { tribeHome } from '../../game/model/tribe-peril'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'
import { useTribeFollow } from '../../state/tribe-follow'
import { knownTribeName } from '../../state/worldStore'
import { getOwnWorldSeed } from '../../simulation/worldSource'
import { useWorldReplaced } from '../../state/world-replaced'
import { screenBusy, TOAST_RETRY_MS } from './screenBusy'
import './famine-toast.css'

/** How long a warning stays up before it goes away on its own. */
export const FAMINE_SHOW_MS = 12_000
/** Warnings waiting for a free screen; past this the oldest fold into one "and N more" warning. */
const MAX_QUEUED = 5

function worldKey(): string {
  try {
    return getOwnWorldSeed()
  } catch {
    return ''
  }
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
  const [queue, setQueue] = useState<QueuedFamine[]>([])
  const [, setTick] = useState(0)
  const nextId = useRef(1)
  const seen = useRef<{ key: string; tick: number } | null>(null)

  // A world swapped in mid-session (a save restored, a recovery copy) is only learned, never warned about. This runs before
  // the look at the world below, so a swap and its first frame arriving together start over and then learn that frame.
  const replaced = useWorldReplaced((st) => st.generation)
  const replacedSeen = useRef(replaced)
  useEffect(() => {
    if (replaced === replacedSeen.current) return
    replacedSeen.current = replaced
    watch.current = null
    seen.current = null
    setQueue([])
  }, [replaced])

  // Look at the world each time it changes; warnings join the queue. A new world (no world for a moment, a
  // different seed, or the tick going back, as when a save loads) starts the watch over and drops warnings
  // still waiting about the old one, so nothing is said about a world that is no longer there.
  useEffect(() => {
    if (!world) {
      watch.current = null
      seen.current = null
      setQueue([])
      return
    }
    const key = worldKey()
    const last = seen.current
    seen.current = { key, tick: world.tick }
    if (last && (last.key !== key || world.tick < last.tick)) {
      watch.current = null
      setQueue([])
    }
    const result = watchFamine(watch.current, world)
    watch.current = result.watch
    const { warnFollowedOnly, followed } = useTribeFollow.getState()
    const due = result.warnings.filter((w) => !warnFollowedOnly || followed.includes(w.lineage))
    if (due.length === 0) return
    const added = due.map((w) => ({ id: nextId.current++, lineage: w.lineage, stage: w.stage, count: 1 }))
    setQueue((q) => enqueueFamine(q, added, MAX_QUEUED))
  }, [world])

  // Warnings still waiting follow the follow settings as they change: a tribe unfollowed, or warnings limited
  // to followed tribes, drops its waiting warnings. The "N more" summary stays.
  const warnFollowedOnly = useTribeFollow((st) => st.warnFollowedOnly)
  const followed = useTribeFollow((st) => st.followed)
  useEffect(() => {
    if (!warnFollowedOnly) return
    setQueue((q) => {
      const kept = q.filter((w) => w.lineage === null || followed.includes(w.lineage))
      return kept.length === q.length ? q : kept
    })
  }, [warnFollowedOnly, followed])

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
  const dismiss = () => setQueue((q) => q.filter((x) => x.id !== shown.id))
  if (shown.lineage === null) {
    return (
      <div className="famine-toast famine-risk" role="status" aria-live="polite">
        <span className="famine-toast-text">{t('panels.famine.more', { count: shown.count })}</span>
        <button className="famine-toast-close" aria-label={t('panels.famine.dismiss')} onClick={dismiss}>
          ×
        </button>
      </div>
    )
  }
  const lineage = shown.lineage
  const name = knownTribeName(world?.lineage_names, lineage) ?? lineage.slice(0, 6)
  const goTo = () => {
    const current = latest.current
    if (current) {
      const home = tribeHome(current, lineage)
      if (home) useCameraFocus.getState().focusTile(Math.round(home.x), Math.round(home.y))
    }
    useUIStore.getState().setFocus(`lineage:${lineage}`)
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
