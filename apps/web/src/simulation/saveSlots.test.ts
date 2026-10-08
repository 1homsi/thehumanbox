import { describe, expect, it } from 'vitest'
import { SAVE_SLOT_COUNT, isSaveSlot, slotWorldId } from './saveSlots'

describe('save slots', () => {
  it('accepts only the slot numbers that exist', () => {
    expect(isSaveSlot(1)).toBe(true)
    expect(isSaveSlot(SAVE_SLOT_COUNT)).toBe(true)
    expect(isSaveSlot(0)).toBe(false)
    expect(isSaveSlot(SAVE_SLOT_COUNT + 1)).toBe(false)
    expect(isSaveSlot(1.5)).toBe(false)
  })

  it('keeps each slot apart from the autosave and from the other slots', () => {
    const keys = [slotWorldId('world-a', 1), slotWorldId('world-a', 2), 'world-a']
    expect(new Set(keys).size).toBe(keys.length)
    expect(slotWorldId('world-a', 1)).not.toBe(slotWorldId('world-b', 1))
  })
})
