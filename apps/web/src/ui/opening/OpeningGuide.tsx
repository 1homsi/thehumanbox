import { useEffect, useMemo } from 'react'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'
import { tribeHome } from '../../game/model/tribe-peril'
import { useCameraFocus } from '../../state/camera-focus'
import { largestTribe, openingLine } from './opening-lines'
import { openingHides, useOpeningGuide, type OpeningBeat } from '../../state/opening-guide'
import { trackEvent } from '../../shared/observability'
import { screenBusy } from '../toasts/screenBusy'

/** How close the camera sits on the followed tribe: near enough to see people at work. */
const MEET_ZOOM = 3

/**
 * Seconds each beat stays before the next one. The powers beat waits for the player to try a power or answer a
 * prayer, and moves on by itself after its time only if they never do.
 */
const BEAT_SECONDS: Record<OpeningBeat, number> = {
  meet: 9,
  work: 11,
  need: 13,
  powers: 45,
  history: 12,
  world: 15,
}
/** The powers beat moves on this long after the player first acts, so they see what their power did. */
const AFTER_ACTING_SECONDS = 5

/**
 * A first game's opening: the camera close on one tribe, one line at a time about what it is doing, and the rest
 * of the screen brought in step by step (powers, then the history screens, then the whole world). It runs once,
 * after the welcome card, and can be skipped at any point.
 */
export function OpeningGuide({ world }: { world: WorldState | null }) {
  const beat = useOpeningGuide((s) => s.beat)
  const tribe = useOpeningGuide((s) => s.tribe)
  const beatSeconds = useOpeningGuide((s) => s.beatSeconds)
  const acted = useOpeningGuide((s) => s.acted)

  // Pick the tribe once the world has people, and pick again if it dies out during the opening.
  const alive = useMemo(
    () => !!(world && tribe && world.organisms.some((o) => o.alive !== false && o.lineage_id === tribe)),
    [world, tribe],
  )
  useEffect(() => {
    if (!beat || !world || alive) return
    const next = largestTribe(world)
    if (!next) return
    useOpeningGuide.getState().setTribe(next)
    const home = tribeHome(world, next)
    if (home) useCameraFocus.getState().focusTile(Math.round(home.x), Math.round(home.y), MEET_ZOOM)
  }, [beat, world, alive])

  // The clock runs only while the player can see the opening: not behind the welcome card, a dialog or a hidden tab.
  const running = !!beat
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      if (!screenBusy('.opening-caption')) useOpeningGuide.getState().tick()
    }, 1000)
    return () => window.clearInterval(id)
  }, [running])

  // Answering a prayer counts as acting.
  const answered = world?.faith?.answered ?? 0
  useEffect(() => {
    if (beat === 'powers' && answered > 0) useOpeningGuide.getState().noteAction()
  }, [beat, answered])

  useEffect(() => {
    if (!beat) return
    const due = beat === 'powers' && acted ? AFTER_ACTING_SECONDS : BEAT_SECONDS[beat]
    if (beatSeconds >= due) useOpeningGuide.getState().advance()
  }, [beat, beatSeconds, acted])

  useEffect(() => {
    if (!beat) return
    trackEvent('opening_beat', { beat })
    if (beat === 'world') useCameraFocus.getState().fitWorld()
  }, [beat])

  // The parts of the screen not yet introduced stay hidden (in place, so nothing shifts when they come in).
  useEffect(() => {
    const body = document.body
    const hidden = [
      openingHides(beat, 'powers') && 'powers',
      openingHides(beat, 'header') && 'header',
    ].filter(Boolean)
    if (hidden.length) body.dataset.opening = hidden.join(' ')
    else delete body.dataset.opening
    return () => {
      delete body.dataset.opening
    }
  }, [beat])

  if (!beat || !world || !tribe || !alive) return null
  const line = openingLine(beat, world, tribe)
  if (!line) return null

  const skip = () => {
    trackEvent('opening_skip', { beat })
    useOpeningGuide.getState().finish()
  }

  return (
    <div className="opening-caption" role="status" aria-live="polite">
      {/* Keyed by the beat, so each new beat's line fades in (a live count changing in it does not). */}
      <p key={beat} className="opening-line">
        {line}
      </p>
      <button type="button" className="opening-skip" onClick={skip}>
        {beat === 'world' ? t('dialogs.opening.done') : t('dialogs.opening.skip')}
      </button>
    </div>
  )
}
