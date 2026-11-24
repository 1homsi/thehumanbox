import { describe, expect, it, vi } from 'vitest'
import { createSteamAchievementSync, steamAchievementName } from './steam-achievements'

const achievement = (id: string, unlocked: boolean) => ({ id, title: id, detail: '', unlocked })

describe('Steam achievements', () => {
  it('names an achievement the way Steam allows', () => {
    expect(steamAchievementName('full-year')).toBe('FULL_YEAR')
    expect(steamAchievementName('hundred-souls')).toBe('HUNDRED_SOULS')
  })

  it('sends each unlocked achievement once', async () => {
    const unlock = vi.fn(async (name: string) => ({ unlocked: name.length > 0 }))
    const sync = createSteamAchievementSync(unlock)
    sync([achievement('village', true), achievement('ruler', false)])
    sync([achievement('village', true), achievement('ruler', true)])
    await Promise.resolve()
    expect(unlock.mock.calls.map((call) => call[0])).toEqual(['VILLAGE', 'RULER'])
  })

  it('tries again after Steam refuses or the call fails', async () => {
    const unlock = vi
      .fn<(name: string) => Promise<{ unlocked: boolean }>>()
      .mockResolvedValueOnce({ unlocked: false })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ unlocked: true })
    const sync = createSteamAchievementSync(unlock)
    for (let i = 0; i < 4; i++) {
      sync([achievement('elder', true)])
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(unlock).toHaveBeenCalledTimes(3)
  })

  it('still reports an achievement whose goal stopped holding before Steam took it', async () => {
    const unlock = vi
      .fn<(name: string) => Promise<{ unlocked: boolean }>>()
      .mockResolvedValueOnce({ unlocked: false })
      .mockResolvedValue({ unlocked: true })
    const sync = createSteamAchievementSync(unlock)
    sync([achievement('elder', true)])
    await new Promise((resolve) => setTimeout(resolve, 0))
    sync([achievement('elder', false)])
    await new Promise((resolve) => setTimeout(resolve, 0))
    sync([achievement('elder', false)])
    expect(unlock).toHaveBeenCalledTimes(2)
  })
})
