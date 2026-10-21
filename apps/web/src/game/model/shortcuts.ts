/** What a game key does, or null for keys the game does not use. */
export type ShortcutAction =
  | { kind: 'speed'; tool: 'normal' | 'fast2' | 'fast4' | 'fast10' }
  | { kind: 'prayer' }
  | { kind: 'brink' }
  | { kind: 'brush'; delta: 1 | -1 }
  | { kind: 'help' }

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
  if (key === '-') return { kind: 'brush', delta: -1 }
  if (key === '=' || key === '+') return { kind: 'brush', delta: 1 }
  if (key === '?') return { kind: 'help' }
  return null
}

/**
 * The shortcut a game key should run, or null. The key list is help, not a
 * sandbox tool, so `?` still opens and closes it when the sandbox controls are
 * off (a hosted world, or a desktop profile that changed while the list was
 * open); every other game key needs them.
 */
export function gameKeyAction(
  event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
  sandboxControlsEnabled: boolean,
): ShortcutAction | null {
  const action = shortcutFor(event)
  if (!action) return null
  if (action.kind !== 'help' && !sandboxControlsEnabled) return null
  return action
}

/**
 * Keys typed into a field or a dialog belong to it, not to the game. A button is not a field: it keeps
 * focus after a click, and the game keys (? and the tool hotkeys) must still answer after one.
 */
export function typingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return (
    !!el &&
    (!!el.closest?.('input, textarea, select, dialog, [role="dialog"]') || el.isContentEditable === true)
  )
}

/**
 * Escape that something else already used: a Radix dialog or the palette (they `preventDefault`), a field,
 * a dialog the player is typing in, or the open key help. It must not also disarm the tool or leave photo mode.
 */
export function escapeHandledElsewhere(
  event: { defaultPrevented: boolean; target: EventTarget | null },
  helpOpen: boolean,
): boolean {
  if (event.defaultPrevented || helpOpen || typingTarget(event.target)) return true
  return !!(event.target as HTMLElement | null)?.closest?.('dialog')
}

/**
 * With the map itself focused (a button inside it is not the map) its camera takes `+`, `=` and `-` as zoom, so the brush keys leave them alone;
 * anywhere else they resize the brush.
 */
export function mapOwnsZoomKeys(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.classList?.contains('map2d-world')
}

export const SHORTCUT_HELP: ReadonlyArray<[string, string]> = [
  ['1 2 3 4', 'speed 1× 2× 4× 10×'],
  [', .', 'slower or faster'],
  ['space', 'pause or play'],
  ['/', 'find a tool'],
  ['⌘S', 'save the world (Ctrl+S off a Mac)'],
  ['P', 'answer the most urgent prayer'],
  ['B', 'go to the next tribe on the brink'],
  ['[ ]', 'previous or next person'],
  ['- =', 'smaller or larger brush (zoom out or in while the map has focus)'],
  ['?', 'show or hide this list'],
  ['H', 'hide the interface'],
  ['0', 'fit the world'],
  ['Q E R T Y U I O F G', 'pick the first ten tools on the bar'],
]
