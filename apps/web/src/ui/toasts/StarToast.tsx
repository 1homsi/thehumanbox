import { useEffect, useRef, useState } from 'react'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import type { WorldState } from '../../shared/types'
import { ToolSprite } from '../toolbar/ToolSprite'
import { screenBusy, TOAST_RETRY_MS } from './screenBusy'
import { t } from '../../i18n'

export const STAR_PROMPT_KEY = 'thb-star-prompt-v2'
/** v1 stored a bare 'shown' | 'dismissed' | 'starred'; only the starred outcome is carried over. */
export const LEGACY_STAR_PROMPT_KEY = 'thb-star-prompt-v1'
// A world must have been played for a little while before its first big moment can become an ask.
export const STAR_MIN_PLAY_MS = 60_000
// Late enough that the first minutes belong to the world, not to prompts.
export const STAR_DELAY_MIN_MS = 3 * 60_000
export const STAR_DELAY_MAX_MS = 5 * 60_000
// A dismissal is not forever: ask again after a week, at most three times.
export const STAR_REASK_AFTER_MS = 7 * 24 * 60 * 60_000
export const STAR_MAX_ASKS = 3

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
}

function writeState(state: StarPromptState): boolean {
  try {
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function readState(): ReadResult {
  try {
    const raw = window.localStorage.getItem(STAR_PROMPT_KEY)
    if (!raw) {
      // Players who already starred under v1 must never be asked again; dismissals may be re-asked.
      if (window.localStorage.getItem(LEGACY_STAR_PROMPT_KEY) === 'starred') {
        const migrated: StarPromptState = { asks: 1, starred: true }
        if (!writeState(migrated)) return { ok: false }
        return { ok: true, state: migrated }
      }
      return { ok: true, state: null }
    }
    const parsed = JSON.parse(raw) as StarPromptState
    if (typeof parsed.asks !== 'number') return { ok: true, state: null }
    // A tab still on the v1 bundle can record a star after v2 state exists.
    if (!parsed.starred && window.localStorage.getItem(LEGACY_STAR_PROMPT_KEY) === 'starred') {
      const migrated: StarPromptState = { ...parsed, starred: true }
      if (!writeState(migrated)) return { ok: false }
      return { ok: true, state: migrated }
    }
    return { ok: true, state: parsed }
  } catch {
    return { ok: false }
  }
}

/** True when the prompt must stay hidden: already handled, out of asks, cooling down, or storage is unusable. */
function alreadyAsked(): boolean {
  const read = readState()
  if (!read.ok) return true
  const state = read.state
  if (!state) return false
  if (state.starred) return true
  if (state.asks >= STAR_MAX_ASKS) return true
  // Closing the tab mid-prompt is not a dismissal: ask again next visit.
  return state.dismissedAt !== undefined && Date.now() - state.dismissedAt < STAR_REASK_AFTER_MS
}

function hasSettlement(world: WorldState): boolean {
  return world.settlements?.some((settlement) => settlement.tier >= 1) ?? false
}

/**
 * Asks once per visit for a star on GitHub, up to three times over the player's lifetime,
 * with a week between dismissals. The first settlement is the preferred moment; the old
 * three-to-five-minute timer remains as a fallback. Nothing is shown during the first minute
 * or while another card is on screen.
 */
export function StarToast({ world = null }: { world?: WorldState | null }) {
  const [visible, setVisible] = useState(false)
  const [shownTrigger, setShownTrigger] = useState<StarPromptTrigger | null>(null)
  const requestMoment = useRef<(trigger: StarPromptTrigger) => void>(() => undefined)
  const settlementWatch = useRef<SettlementWatch | null>(null)

  useEffect(() => {
    if (alreadyAsked()) return
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
    timer = window.setTimeout(
      () => request('timer'),
      STAR_DELAY_MIN_MS + Math.random() * (STAR_DELAY_MAX_MS - STAR_DELAY_MIN_MS),
    )
    return () => {
      disposed = true
      requestMoment.current = () => undefined
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

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
      }
      return
    }
    if (settlements === undefined) {
      settlementWatch.current = { ...previous, tick: world.tick }
      return
    }
    const firstSettlement = previous.hasData && !previous.seenSettlement && found
    settlementWatch.current = {
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
    trackEvent('star_prompt_dismissed', { trigger })
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
            trackEvent('star_prompt_clicked', { trigger })
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
    </div>
  )
}
