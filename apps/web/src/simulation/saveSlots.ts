/** How many named saves a browser world keeps alongside its autosave. */
export const SAVE_SLOT_COUNT = 3

export interface SaveSlotInfo {
  slot: number
  tick: number
  savedAt: number
}

export function isSaveSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= SAVE_SLOT_COUNT
}

/** The storage key for one slot. It can never collide with the autosave key, which is the bare world id. */
export function slotWorldId(worldId: string, slot: number): string {
  return `${worldId}:slot:${slot}`
}
