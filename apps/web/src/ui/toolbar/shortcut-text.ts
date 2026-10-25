import { t, type MessageKey } from '../../i18n'

/**
 * The description of each row of `SHORTCUT_HELP`, keyed by the keys it lists. The keys themselves
 * are shown as they are; a row the table does not name keeps its English description.
 */
const SHORTCUT_TEXT: Readonly<Record<string, MessageKey | undefined>> = {
  '1 2 3 4': 'dock.shortcuts.speed',
  ', .': 'dock.shortcuts.slowerFaster',
  space: 'dock.shortcuts.pause',
  '/': 'dock.shortcuts.find',
  '⌘S': 'dock.shortcuts.save',
  P: 'dock.shortcuts.prayer',
  B: 'dock.shortcuts.brink',
  '[ ]': 'dock.shortcuts.people',
  '- =': 'dock.shortcuts.brush',
  '?': 'dock.shortcuts.help',
  H: 'dock.shortcuts.hide',
  '0': 'dock.shortcuts.fit',
  'double-click': 'dock.shortcuts.doubleClick',
  'Q E R T Y U I O F G': 'dock.shortcuts.tools',
}

/** What a shortcut does, in the active language. */
export function shortcutWhat(keys: string, what: string): string {
  const key = SHORTCUT_TEXT[keys]
  return key ? t(key) : what
}

/** Keys that are words rather than key caps, in the active language. */
const KEY_TEXT: Readonly<Record<string, MessageKey | undefined>> = {
  'double-click': 'dock.shortcuts.doubleClickKeys',
}

/** The keys of a shortcut as shown: key caps as they are, a gesture in the active language. */
export function shortcutKeys(keys: string): string {
  const key = KEY_TEXT[keys]
  return key ? t(key) : keys
}
