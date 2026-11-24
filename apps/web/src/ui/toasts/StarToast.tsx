import { useEffect, useRef, useState } from 'react'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import { shareWorldCard } from '../../shared/shareWorld'
import type { WorldState } from '../../shared/types'
import { freshWorldUsesHeadStart, type WorldStartMode } from '../../simulation/worldStart'
import { ToolSprite } from '../toolbar/ToolSprite'
import { screenBusy, TOAST_RETRY_MS } from './screenBusy'
import { t } from '../../i18n'

export const STAR_PROMPT_KEY = 'thb-star-prompt-v2'
/** v1 stored a bare 'shown' | 'dismissed' | 'starred'; a star or a dismissal is carried over. */
export const LEGACY_STAR_PROMPT_KEY = 'thb-star-prompt-v1'
// Nothing asks until the player has been in a world for about ten minutes.
export const STAR_MIN_PLAY_MS = 10 * 60_000
export const STAR_DELAY_MIN_MS = 10 * 60_000
// One ask per player. A dismissal, a star, or a prompt that was already shown is not repeated.
export const STAR_MAX_ASKS = 1

export type StarPromptTrigger = 'first_settlement' | 'timer'

type StarPromptState = {
  asks: number
  starred?: boolean
  dismissedAt?: number
}

type ReadResult = { ok: true; state: StarPromptState | null } | { ok: false }

type SettlementWatch = {
  tick: number
  hasData: boolean
  seenSettlement: boolean
  /** Tribes that already had a settlement entry in the first census; a head-start world begins with these. */
  startingLineages: Set<string>
}

function writeState(state: StarPromptState): boolean {
  try {
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function remember(state: StarPromptState): ReadResult {
  if (!writeState(state)) return { ok: false }
  return { ok: true, state }
}

function readState(): ReadResult {
  try {
    const raw = window.localStorage.getItem(STAR_PROMPT_KEY)
    const legacy = window.localStorage.getItem(LEGACY_STAR_PROMPT_KEY)
    if (!raw) {
      // Players who already starred or dismissed under v1 are not asked again.
      if (legacy === 'starred') return remember({ asks: 1, starred: true })
      if (legacy === 'dismissed') return remember({ asks: 1, dismissedAt: Date.now() })
      return { ok: true, state: null }
    }
    const parsed = JSON.parse(raw) as StarPromptState
    if (typeof parsed.asks !== 'number') return { ok: true, state: null }
    // A tab still on the v1 bundle can record a star or a dismissal after v2 state exists.
    if (!parsed.starred && legacy === 'starred') return remember({ ...parsed, starred: true })
    if (!parsed.starred && parsed.dismissedAt === undefined && legacy === 'dismissed') {
      return remember({ ...parsed, asks: Math.max(parsed.asks, 1), dismissedAt: Date.now() })
    }
    return { ok: true, state: parsed }
  } catch {
    return { ok: false }
  }
}

/** True when the prompt must stay hidden: already handled, or storage is unusable. */
function alreadyAsked(): boolean {
  const read = readState()
  if (!read.ok) return true
  const state = read.state
  if (!state) return false
  if (state.starred || state.dismissedAt !== undefined) return true
  return state.asks >= STAR_MAX_ASKS
}

function hasSettlement(world: WorldState): boolean {
  return world.settlements?.some((settlement) => settlement.tier >= 1) ?? false
}

function settlementLineages(world: WorldState): Set<string> {
  return new Set((world.settlements ?? []).map((settlement) => settlement.lineage_id))
}

/** A settlement founded by a tribe that had none when the session began. */
function hasNewSettlement(world: WorldState, startingLineages: Set<string>): boolean {
  return (
    world.settlements?.some(
      (settlement) => settlement.tier >= 1 && !startingLineages.has(settlement.lineage_id),
    ) ?? false
  )
}

function startModeProps(startMode: WorldStartMode | null): { start_mode?: WorldStartMode } {
  return startMode ? { start_mode: startMode } : {}
}

/**
 * Asks once for a star on GitHub, after about ten minutes in a world. A dismissal or a star
 * is permanent. The first settlement is the preferred moment once that wait has passed;
 * otherwise a timer asks. Nothing is shown before the wait, before a world exists, or while
 * another card is on screen. A head-start world opens with settlements already standing, so
 * there the moment is the first settlement founded after the session began.
 */
export function StarToast({
  world = null,
  startMode = null,
}: {
  world?: WorldState | null
  startMode?: WorldStartMode | null
}) {
  const [visible, setVisible] = useState(false)
  const [shownTrigger, setShownTrigger] = useState<StarPromptTrigger | null>(null)
  const requestMoment = useRef<(trigger: StarPromptTrigger) => void>(() => undefined)
  const settlementWatch = useRef<SettlementWatch | null>(null)
  const startModeRef = useRef(startMode)
  // Declared before the effects that read it, so they see this render's mode.
  useEffect(() => {
    startModeRef.current = startMode
  }, [startMode])
  const inWorld = world != null

  useEffect(() => {
    if (!inWorld || alreadyAsked()) return
    const startedAt = Date.now()
    let timer: number | null = null
    let disposed = false
    let settled = false
    let pending: StarPromptTrigger | null = null

    const show = () => {
      timer = null
      const trigger = pending
      if (disposed || settled || !trigger) return
      const playMs = Date.now() - startedAt
      if (playMs < STAR_MIN_PLAY_MS) {
        timer = window.setTimeout(show, STAR_MIN_PLAY_MS - playMs)
        return
      }
      if (screenBusy()) {
        timer = window.setTimeout(show, TOAST_RETRY_MS)
        return
      }
      // Another window may have handled the prompt while this one waited.
      if (alreadyAsked()) {
        settled = true
        return
      }
      const read = readState()
      if (!read.ok) {
        settled = true
        return
      }
      const asks = (read.state?.asks ?? 0) + 1
      if (!writeState({ ...read.state, asks })) {
        settled = true
        return
      }
      settled = true
      setShownTrigger(trigger)
      setVisible(true)
      trackEvent('star_prompt_shown', {
        trigger,
        play_ms: Math.max(0, Math.round(playMs)),
        ask_number: asks,
        ...startModeProps(startModeRef.current),
      })
    }

    const request = (trigger: StarPromptTrigger) => {
      // The first due trigger owns this visit, even if its toast has to wait behind a modal.
      if (disposed || settled || pending !== null) return
      pending = trigger
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      show()
    }

    requestMoment.current = request
    timer = window.setTimeout(() => request('timer'), STAR_DELAY_MIN_MS)
    return () => {
      disposed = true
      requestMoment.current = () => undefined
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [inWorld])

  useEffect(() => {
    if (!world) {
      settlementWatch.current = null
      return
    }
    const previous = settlementWatch.current
    const settlements = world.settlements
    const found = hasSettlement(world)
    // The first census is a baseline, not news. This is what keeps a loaded save (and a world
    // that was already running when the page opened) from immediately producing a star prompt.
    if (previous === null || world.tick < previous.tick || (!previous.hasData && settlements !== undefined)) {
      settlementWatch.current = {
        tick: world.tick,
        hasData: settlements !== undefined,
        seenSettlement: found,
        startingLineages: settlementLineages(world),
      }
      return
    }
    if (settlements === undefined) {
      settlementWatch.current = { ...previous, tick: world.tick }
      return
    }
    const headStart = startModeRef.current !== null && freshWorldUsesHeadStart(startModeRef.current)
    // A head-start world's own settlements are the scenery it opens with; the moment is the first
    // one a new tribe founds after that. Every other world keeps the first-settlement-ever rule.
    const firstSettlement = headStart
      ? hasNewSettlement(world, previous.startingLineages)
      : previous.hasData && !previous.seenSettlement && found
    settlementWatch.current = {
      ...previous,
      tick: world.tick,
      hasData: true,
      // Once a settlement has been seen, a later decline and refounding is not another first moment.
      seenSettlement: previous.seenSettlement || found,
    }
    if (firstSettlement) requestMoment.current('first_settlement')
  }, [world])

  if (!visible || !shownTrigger) return null
  const trigger = shownTrigger
  const dismiss = () => {
    const read = readState()
    // A star recorded in another tab wins: closing the stale toast must not clear it.
    if (!read.ok || !read.state?.starred) {
      const asks = read.ok ? (read.state?.asks ?? 1) : 1
      writeState({ asks, dismissedAt: Date.now() })
    }
    setVisible(false)
    trackEvent('star_prompt_dismissed', { trigger, ...startModeProps(startMode) })
  }

  const href = `${REPO_URL}?utm_source=thehumanbox&utm_medium=star_toast&utm_campaign=star_prompt_${trigger}`
  return (
    <div className="desktop-toast star-toast" role="status" aria-live="polite">
      <button className="desktop-toast-close" aria-label={t('dialogs.toast.dismiss')} onClick={dismiss}>
        ×
      </button>
      <div className="star-toast-head">
        <span className="star-toast-star" aria-hidden="true">
          <ToolSprite icon="⭐" size={28} />
        </span>
        <div className="desktop-toast-title">
          {t(
            trigger === 'first_settlement' ? 'dialogs.toast.starSettlementTitle' : 'dialogs.toast.starTitle',
          )}
        </div>
      </div>
      <div className="desktop-toast-sub">{t('dialogs.toast.starSub')}</div>
      <div className="desktop-toast-actions">
        <a
          className="desktop-toast-primary"
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            const read = readState()
            const asks = read.ok ? (read.state?.asks ?? 1) : 1
            writeState({ asks, starred: true })
            setVisible(false)
            trackEvent('star_prompt_clicked', { trigger, ...startModeProps(startMode) })
          }}
        >
          <span className="star-toast-glyph" aria-hidden="true">
            ★
          </span>{' '}
          {t('dialogs.toast.starCta')}
        </a>
        <button className="desktop-toast-secondary" onClick={dismiss}>
          {t('dialogs.toast.starLater')}
        </button>
      </div>
      {trigger === 'first_settlement' && world && (
        <button
          className="star-toast-share"
          onClick={() => {
            setVisible(false)
            void shareWorldCard(world)
          }}
        >
          ↗ {t('share.shareWorld')}
        </button>
      )}
    </div>
  )
}
