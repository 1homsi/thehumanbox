export type ChroniclesTab = 'history' | 'lives'

export function chroniclesDefaultTab(storyCount: number, headlineCount: number): ChroniclesTab {
  return headlineCount > 0 || storyCount === 0 ? 'history' : 'lives'
}

export function chroniclesBadgeCount(storyCount: number, headlineCount: number): number {
  return chroniclesDefaultTab(storyCount, headlineCount) === 'history' ? headlineCount : storyCount
}
