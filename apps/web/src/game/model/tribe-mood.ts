import type { PerilCause } from '../../shared/types'

export type TribeMood =
  | 'starving'
  | 'thirsty'
  | 'dying'
  | 'war'
  | 'sick'
  | 'hungry'
  | 'growing'
  | 'shrinking'
  | 'thriving'
  | 'steady'

export interface TribeMoodInput {
  people: number
  food: number
  health: number
  sick: number
  peril?: PerilCause | null
  atWar: boolean
  starving?: boolean
  trend: 'up' | 'down' | 'flat'
}

export const MOOD_TONE: Record<TribeMood, 'bad' | 'warn' | 'good' | 'calm'> = {
  starving: 'bad',
  thirsty: 'bad',
  dying: 'bad',
  war: 'bad',
  sick: 'warn',
  hungry: 'warn',
  shrinking: 'warn',
  growing: 'good',
  thriving: 'good',
  steady: 'calm',
}

export function tribeMood(input: TribeMoodInput): TribeMood {
  if (input.peril === 'hunger' || input.starving) return 'starving'
  if (input.peril === 'thirst') return 'thirsty'
  if (input.peril === 'war' || input.atWar) return 'war'
  if (input.peril === 'sickness') return 'sick'
  if (input.peril) return 'dying'
  if (input.people > 0 && input.sick / input.people >= 0.25) return 'sick'
  if (input.food < 0.35) return 'hungry'
  if (input.trend === 'up') return 'growing'
  if (input.trend === 'down') return 'shrinking'
  if (input.food >= 0.6 && input.health >= 0.6) return 'thriving'
  return 'steady'
}
