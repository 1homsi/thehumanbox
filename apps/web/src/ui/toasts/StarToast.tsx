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
/** Shown at most once per browser tab, even if storage is shared with another tab. */
export const STAR_SESSION_KEY = 'thb-star-prompt-session'
// A one-minute floor keeps the prompt off the opening beat. After that, a first
// settlement (or another delightful moment) may ask immediately. Otherwise the
// timer asks at five minutes, around the median session length. Ten minutes
// hid the prompt from most sessions (only about a third reached it).
export const STAR_MIN_PLAY_MS = 60_000
export const STAR_DELAY_MIN_MS = 5 * 60_000
// One ask per player. A dismissal, a star, or a prompt that was already shown is not repeated.
export const STAR_MAX_ASKS = 1

export type StarPromptTrigger = 'first_settlement' | 'first_word' | 'first_war' | 'first_coup' | 'timer'

type StarPromptState = {
  asks: number
  starred?: boolean
  dismissedAt?: number
}

type ReadResult = { ok: true; state: StarPromptState | null } | { ok: false }

type SignatureSet = Set<string>

type MomentWatch = {
  tick: number
  hasSettlementData: boolean
  seenSettlement: boolean
  startingLineages: Set<string>
  words: { hasData: boolean; starting: SignatureSet }
  wars: { hasData: boolean; starting: SignatureSet }
  coups: { hasData: boolean; starting: SignatureSet }
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

function askedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(STAR_SESSION_KEY) === 'shown'
  } catch {
    return false
  }
}

function markAskedThisSession(): void {
  try {
    window.sessionStorage.setItem(STAR_SESSION_KEY, 'shown')
  } catch {
    // The in-memory settled flag still stops a second ask in this visit.
  }
}

/** True when the prompt must stay hidden: already handled, or storage is unusable. */
function alreadyAsked(): boolean {
  if (askedThisSession()) return true
  const read = readState()
  if (!read.ok) return true
  const state = read.state
  if (!state) return false
  if (state.starred || state.dismissedAt !== undefined) return true
  // A previous show still counts: re-asking people who already saw it would dilute clicks.
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

function wordSignatures(world: WorldState): SignatureSet | null {
  if (world.lineage_words === undefined) return null
  const keys = new Set<string>()
  for (const [lineage, vocab] of Object.entries(world.lineage_words)) {
    for (const word of Object.keys(vocab)) keys.add(`${lineage}:${word}`)
  }
  return keys
}

function warSignatures(world: WorldState): SignatureSet | null {
  if (world.battles === undefined && world.tribe_chronicle === undefined && world.nations === undefined) {
    return null
  }
  const keys = new Set<string>()
  for (const battle of world.battles ?? []) keys.add(`battle:${battle.id}`)
  for (const [lineage, rows] of Object.entries(world.tribe_chronicle ?? {})) {
    for (const row of rows) {
      if (row.kind === 'war' || row.kind === 'raid') {
        keys.add(`chr:${lineage}:${row.tick}:${row.kind}:${row.other ?? ''}`)
      }
    }
  }
  for (const nation of world.nations ?? []) {
    for (const relation of nation.relations) {
      if (relation.status === 'war') keys.add(`nation:${nation.id}:${relation.with}`)
    }
  }
  return keys
}

function coupSignatures(world: WorldState): SignatureSet | null {
  if (world.headlines === undefined) return null
  const keys = new Set<string>()
  for (const headline of world.headlines) {
    if (/coup/i.test(headline.text)) keys.add(`${headline.tick}:${headline.text}`)
  }
  return keys
}

function hasNewSignature(current: SignatureSet, starting: SignatureSet): boolean {
  for (const item of current) {
    if (!starting.has(item)) return true
  }
  return false
}

function snapshotMoments(world: WorldState): MomentWatch {
  const words = wordSignatures(world)
  const wars = warSignatures(world)
  const coups = coupSignatures(world)
  return {
    tick: world.tick,
    hasSettlementData: world.settlements !== undefined,
    seenSettlement: hasSettlement(world),
    startingLineages: settlementLineages(world),
    words: { hasData: words !== null, starting: words ?? new Set() },
    wars: { hasData: wars !== null, starting: wars ?? new Set() },
    coups: { hasData: coups !== null, starting: coups ?? new Set() },
  }
}

/** Prefer the game's own hook (a first word) over a fight or a settlement. */
function momentTrigger(
  world: WorldState,
  previous: MomentWatch,
  startMode: WorldStartMode | null,
): StarPromptTrigger | null {
  const words = wordSignatures(world)
  if (previous.words.hasData && words && hasNewSignature(words, previous.words.starting)) return 'first_word'
  const coups = coupSignatures(world)
  if (previous.coups.hasData && coups && hasNewSignature(coups, previous.coups.starting)) return 'first_coup'
  const wars = warSignatures(world)
  if (previous.wars.hasData && wars && hasNewSignature(wars, previous.wars.starting)) return 'first_war'
  const headStart = startMode !== null && freshWorldUsesHeadStart(startMode)
  const firstSettlement = headStart
    ? hasNewSettlement(world, previous.startingLineages)
    : previous.hasSettlementData && !previous.seenSettlement && hasSettlement(world)
  if (firstSettlement) return 'first_settlement'
  return null
}

function startModeProps(startMode: WorldStartMode | null): { start_mode?: WorldStartMode } {
  return startMode ? { start_mode: startMode } : {}
}

function titleKey(
  trigger: StarPromptTrigger,
):
  | 'dialogs.toast.starSettlementTitle'
  | 'dialogs.toast.starWordTitle'
  | 'dialogs.toast.starWarTitle'
  | 'dialogs.toast.starCoupTitle'
  | 'dialogs.toast.starTitle' {
  if (trigger === 'first_settlement') return 'dialogs.toast.starSettlementTitle'
  if (trigger === 'first_word') return 'dialogs.toast.starWordTitle'
  if (trigger === 'first_war') return 'dialogs.toast.starWarTitle'
  if (trigger === 'first_coup') return 'dialogs.toast.starCoupTitle'
  return 'dialogs.toast.starTitle'
}

/**
 * Asks once for a star on GitHub. After a one-minute floor, a first invented word, a first
 * war or coup, or the first settlement may ask; otherwise a timer asks at about five minutes.
 * A dismissal or a star is permanent. Nothing is shown before the floor, before a world
 * exists, or while another card is on screen. A head-start world opens with settlements
 * already standing, so there the settlement moment is the first one a new tribe founds
 * after the session began.
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
  const momentWatch = useRef<MomentWatch | null>(null)
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
      markAskedThisSession()
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
      momentWatch.current = null
      return
    }
    const previous = momentWatch.current
    const settlements = world.settlements
    const found = hasSettlement(world)
    // The first census is a baseline, not news. This is what keeps a loaded save (and a world
    // that was already running when the page opened) from immediately producing a star prompt.
    if (previous === null || world.tick < previous.tick) {
      momentWatch.current = snapshotMoments(world)
      return
    }
    const next: MomentWatch = {
      ...previous,
      tick: world.tick,
      hasSettlementData: previous.hasSettlementData || settlements !== undefined,
      seenSettlement: previous.seenSettlement || found,
      startingLineages: previous.hasSettlementData ? previous.startingLineages : settlementLineages(world),
    }
    const words = wordSignatures(world)
    if (!previous.words.hasData && words !== null) next.words = { hasData: true, starting: words }
    const wars = warSignatures(world)
    if (!previous.wars.hasData && wars !== null) next.wars = { hasData: true, starting: wars }
    const coups = coupSignatures(world)
    if (!previous.coups.hasData && coups !== null) next.coups = { hasData: true, starting: coups }

    const trigger = momentTrigger(world, previous, startModeRef.current)
    // Once a field has been seen, later arrivals still use the original baseline.
    if (previous.words.hasData && words) next.words = previous.words
    if (previous.wars.hasData && wars) next.wars = previous.wars
    if (previous.coups.hasData && coups) next.coups = previous.coups
    momentWatch.current = next
    if (trigger) requestMoment.current(trigger)
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
        <div className="desktop-toast-title">{t(titleKey(trigger))}</div>
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
