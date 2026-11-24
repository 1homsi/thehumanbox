import type { Achievement } from '../game/model/achievements'

export function steamAchievementName(id: string): string {
  return id.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
}

type Unlock = (name: string) => Promise<{ unlocked: boolean }>

export function createSteamAchievementSync(unlock: Unlock): (achievements: readonly Achievement[]) => void {
  const sent = new Set<string>()
  return (achievements) => {
    for (const achievement of achievements) {
      if (!achievement.unlocked || sent.has(achievement.id)) continue
      sent.add(achievement.id)
      unlock(steamAchievementName(achievement.id)).then(
        (result) => {
          if (!result.unlocked) sent.delete(achievement.id)
        },
        () => sent.delete(achievement.id),
      )
    }
  }
}
