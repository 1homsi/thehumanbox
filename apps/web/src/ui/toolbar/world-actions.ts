import { typingTarget } from '../../game/model/shortcuts'
import { t } from '../../i18n'

/**
 * World actions that moved off the dock into the header's ⋯ menu (and the phone menu): finding a
 * tool and saving the world. App owns both, since the header has no tools or save of its own.
 */
export interface WorldSave {
  onSave: () => void
  busy: boolean
  error: boolean
  retryable: boolean
  /** What the save is doing or last did, e.g. "saved locally · tick 24,000". */
  status?: string
}

export interface WorldActions {
  /** Opens the tool search; absent when the world takes no tools (a hosted world). */
  findTool?: () => void
  /** Absent when the world is not saved on this device. */
  save?: WorldSave
}

/** Where the save is: the item says so, and a retry is offered only after a failure that can be retried. */
function saveState(save: WorldSave): 'saving' | 'retry' | 'save' {
  if (save.busy) return 'saving'
  if (save.error && save.retryable) return 'retry'
  return 'save'
}

/** The save item's label for where the save is. */
export function saveLabel(save: WorldSave): string {
  const state = saveState(save)
  if (state === 'saving') return t('dock.save.saving')
  if (state === 'retry') return t('dock.save.retry')
  return t('dock.save.saveWorld')
}

/** The phone menu's lower-case label for the same state. */
export function phoneSaveLabel(save: WorldSave): string {
  const state = saveState(save)
  if (state === 'saving') return t('dock.phone.saving')
  if (state === 'retry') return t('dock.phone.retry')
  return t('dock.phone.saveWorld')
}

/** A save in progress, or one that failed for good, cannot be started again. */
export function saveBlocked(save: WorldSave): boolean {
  return save.busy || (save.error && !save.retryable)
}

/** ⌘S on a Mac, Ctrl+S elsewhere. */
export function saveShortcutLabel(): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return mac ? '⌘S' : 'Ctrl+S'
}

/**
 * The world action a key asks for: ⌘S or Ctrl+S saves (even from a field, as in any app), and `/`
 * finds a tool unless the player is typing.
 */
export function worldActionForKey(event: {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  target: EventTarget | null
}): 'save' | 'find' | null {
  if (event.altKey) return null
  // ⌘⇧S is the desktop app's own shortcut, so only a plain ⌘S saves.
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's') return 'save'
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !typingTarget(event.target)) return 'find'
  return null
}
