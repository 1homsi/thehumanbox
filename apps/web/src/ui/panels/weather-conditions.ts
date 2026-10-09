import type { WorldState } from '../../shared/types'

export interface WeatherCondition {
  key: 'rain' | 'storm' | 'drought'
  icon: string
  title: string
  body: string
}

/** Every weather condition the world has right now, in the order the header shows them. */
export function weatherConditions(world: Pick<WorldState, 'weather' | 'drought'>): WeatherCondition[] {
  const out: WeatherCondition[] = []
  if (world.weather?.kind === 'rain') {
    out.push({ key: 'rain', icon: '🌧️', title: 'rain', body: 'Helps dry land recover faster.' })
  }
  if (world.weather?.kind === 'storm') {
    out.push({ key: 'storm', icon: '⛈️', title: 'storm', body: 'Drains energy. Lightning can strike.' })
  }
  if (world.drought) {
    out.push({
      key: 'drought',
      icon: '🏜️',
      title: 'drought',
      body: 'Water is shrinking and thirst deaths are rising.',
    })
  }
  return out
}
