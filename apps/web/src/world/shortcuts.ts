/** What a game key does, or null for keys the game does not use. */
export type ShortcutAction =
  { kind: 'speed'; tool: 'normal' | 'fast2' | 'fast4' | 'fast10' } | { kind: 'prayer' } | { kind: 'brink' }

const SPEEDS = { '1': 'normal', '2': 'fast2', '3': 'fast4', '4': 'fast10' } as const

export function shortcutFor(event: {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}): ShortcutAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key in SPEEDS) return { kind: 'speed', tool: SPEEDS[key as keyof typeof SPEEDS] }
  if (key === 'p') return { kind: 'prayer' }
  if (key === 'b') return { kind: 'brink' }
  return null
}

/** Keys typed into a field or a dialog belong to it, not to the game. */
export function typingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return (
    !!el &&
    (!!el.closest?.('input, textarea, select, button, [role="dialog"]') || el.isContentEditable === true)
  )
}

export const SHORTCUT_HELP: ReadonlyArray<[string, string]> = [
  ['1 2 3 4', 'speed 1× 2× 4× 10×'],
  ['space', 'pause or play'],
  ['P', 'answer the most urgent prayer'],
  ['B', 'go to the next tribe on the brink'],
  ['[ ]', 'previous or next person'],
  ['H', 'hide the interface'],
  ['0', 'fit the world'],
]
