import type { Achievement } from '../game/model/achievements'

export function steamAchievementName(id: string): string {
  return id.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
}

type Unlock = (name: string) => Promise<{ unlocked: boolean }>

export function createSteamAchievementSync(unlock: Unlock): (achievements: readonly Achievement[]) => void {
  const earned = new Set<string>()
  const sent = new Set<string>()
  return (achievements) => {
    for (const achievement of achievements) if (achievement.unlocked) earned.add(achievement.id)
    for (const id of earned) {
      if (sent.has(id)) continue
      sent.add(id)
      unlock(steamAchievementName(id)).then(
        (result) => {
          if (!result.unlocked) sent.delete(id)
        },
        () => sent.delete(id),
      )
    }
  }
}
