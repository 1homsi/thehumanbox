import type { WorldState } from '../../shared/types'
import { t } from '../../i18n'

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
    out.push({ key: 'rain', icon: '🌧️', title: t('panels.weather.rain'), body: t('panels.weather.rainBody') })
  }
  if (world.weather?.kind === 'storm') {
    out.push({
      key: 'storm',
      icon: '⛈️',
      title: t('panels.weather.storm'),
      body: t('panels.weather.stormBody'),
    })
  }
  if (world.drought) {
    out.push({
      key: 'drought',
      icon: '🏜️',
      title: t('panels.weather.drought'),
      body: t('panels.weather.droughtBody'),
    })
  }
  return out
}
