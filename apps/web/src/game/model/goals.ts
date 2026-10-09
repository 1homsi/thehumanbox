import type { Difficulty, GoalStatus } from '../../shared/types'
import { calendarAt } from './calendar'

/** What each difficulty means, as the Goals panel says it. */
export const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  calm: 'Fewer disasters, gentler hunger.',
  normal: 'The standard world.',
  harsh: 'More disasters and sharper hunger.',
}

export const DIFFICULTY_ORDER: Difficulty[] = ['calm', 'normal', 'harsh']

export interface GoalsSummary {
  done: number
  total: number
  /** The world is lost: no one is left alive. */
  lost: boolean
  /** A line for the panel: how many goals are met, or why the world is lost. */
  headline: string
}

/** Counts the goals met and says whether the world has been lost, and on which day. */
export function goalsSummary(
  goals: GoalStatus[] | undefined,
  lostTick: number | null | undefined,
): GoalsSummary {
  const list = goals ?? []
  const done = list.filter((g) => g.done).length
  const total = list.length
  if (lostTick != null) {
    const date = calendarAt(lostTick)
    return {
      done,
      total,
      lost: true,
      headline: `Everyone died in year ${date.year}, ${date.season} day ${date.dayOfSeason}.`,
    }
  }
  return {
    done,
    total,
    lost: false,
    headline: total === 0 ? 'No goals yet.' : `${done} of ${total} goals met.`,
  }
}

/** A goal's progress as a fraction from 0 to 1 (a goal with no target counts as met when done). */
export function goalFraction(goal: GoalStatus): number {
  if (goal.done) return 1
  if (goal.target <= 0) return 0
  return Math.min(1, Math.max(0, goal.progress / goal.target))
}

/** The goal's progress as words: "3 of 5 years", "not yet". */
export function goalProgressText(goal: GoalStatus): string {
  if (goal.done) return 'met'
  if (goal.target === 1) return 'not yet'
  return `${goal.progress} of ${goal.target}`
}
