import { create } from 'zustand'

const DONE_KEY = 'thb-opening-done-v1'

/**
 * The beats of a first game, in order. Each one shows a little more of the screen:
 * - meet: the camera is close on one tribe and nothing else is on screen but the map;
 * - work / need: what that tribe is doing and what it lacks, still nothing else;
 * - powers: the dock and the prayer chip come in, and the player is invited to act;
 * - history: the header's screens come in (the chronicle, stats, search);
 * - world: the camera pulls back to the whole map and everything is on screen.
 */
export const OPENING_BEATS = ['meet', 'work', 'need', 'powers', 'history', 'world'] as const
export type OpeningBeat = (typeof OPENING_BEATS)[number]

function wasDone(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === '1'
  } catch {
    // No storage: the opening would replay on every visit, so treat it as seen.
    return true
  }
}

function saveDone() {
  try {
    window.localStorage.setItem(DONE_KEY, '1')
  } catch {
    // Nothing to keep it in; it simply ends for this visit.
  }
}

interface OpeningGuideState {
  /** The beat on screen, or null when no opening is running. */
  beat: OpeningBeat | null
  /** The tribe the opening follows. */
  tribe: string | null
  /** Seconds spent in the current beat (counted only while the page is visible and nothing covers it). */
  beatSeconds: number
  /** The player used a power since the powers beat began. */
  acted: boolean
  /** Starts the opening, unless the player has had it before. */
  start: () => void
  /** Starts it again from the top (Settings, command palette). */
  replay: () => void
  setTribe: (tribe: string | null) => void
  tick: () => void
  advance: () => void
  noteAction: () => void
  /** Ends it for good: everything is shown again. */
  finish: () => void
}

export const useOpeningGuide = create<OpeningGuideState>((set, get) => ({
  beat: null,
  tribe: null,
  beatSeconds: 0,
  acted: false,
  start: () => {
    if (get().beat || wasDone()) return
    set({ beat: 'meet', tribe: null, beatSeconds: 0, acted: false })
  },
  replay: () => set({ beat: 'meet', tribe: null, beatSeconds: 0, acted: false }),
  setTribe: (tribe) => set({ tribe }),
  tick: () => set((s) => (s.beat ? { beatSeconds: s.beatSeconds + 1 } : s)),
  advance: () => {
    const { beat } = get()
    if (!beat) return
    const next = OPENING_BEATS[OPENING_BEATS.indexOf(beat) + 1]
    if (!next) return get().finish()
    set({ beat: next, beatSeconds: 0 })
  },
  noteAction: () => set((s) => (s.beat ? { acted: true } : s)),
  finish: () => {
    saveDone()
    set({ beat: null, beatSeconds: 0 })
  },
}))

/** True while the beat keeps this part of the screen hidden. */
export function openingHides(beat: OpeningBeat | null, part: 'powers' | 'header'): boolean {
  if (!beat) return false
  const shownFrom: OpeningBeat = part === 'powers' ? 'powers' : 'history'
  return OPENING_BEATS.indexOf(beat) < OPENING_BEATS.indexOf(shownFrom)
}
