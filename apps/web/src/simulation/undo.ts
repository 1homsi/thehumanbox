/**
 * Undo keeps one snapshot of the world, taken just before a player action.
 * Time controls are not actions: advancing the calendar never takes a
 * snapshot, so undo always returns to the last thing the player did.
 */
export function isUndoableCommand(json: string): boolean {
  try {
    const cmd = (JSON.parse(json) as { cmd?: unknown }).cmd
    return typeof cmd === 'string' && cmd !== 'advance'
  } catch {
    return false
  }
}
