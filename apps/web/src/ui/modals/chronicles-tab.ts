import type { HeadlineInfo, StoryEntry } from '../../shared/types'
import { readChronicle } from '../../game/model/chronicle'

export type ChroniclesTab = 'history' | 'lives'

export function chroniclesDefaultTab(livesCount: number, historyCount: number): ChroniclesTab {
  return historyCount > 0 || livesCount === 0 ? 'history' : 'lives'
}

export function chroniclesBadgeCount(livesCount: number, historyCount: number): number {
  return chroniclesDefaultTab(livesCount, historyCount) === 'history' ? historyCount : livesCount
}

export function chronicleCounts(
  stories: readonly StoryEntry[] | undefined,
  headlines: readonly HeadlineInfo[] | undefined,
): { lives: number; history: number } {
  const { lives, history } = readChronicle(stories, headlines)
  return { lives: lives.length, history: history.length }
}
