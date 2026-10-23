import { useMemo } from 'react'
import type { WorldState } from '../../shared/types'
import { t, type MessageKey } from '../../i18n'

interface Props {
  world: WorldState
}

const ERA_KEY: Record<string, MessageKey> = {
  genesis: 'panels.footer.eras.genesis',
  forager: 'panels.footer.eras.forager',
  fire: 'panels.footer.eras.fire',
  shelter: 'panels.footer.eras.shelter',
  tribal: 'panels.footer.eras.tribal',
  invention: 'panels.footer.eras.invention',
  cooking: 'panels.footer.eras.cooking',
  masonry: 'panels.footer.eras.masonry',
  equilibrium: 'panels.footer.eras.equilibrium',
}

const WEATHER_KEY: Record<string, MessageKey> = {
  clear: 'panels.weather.clear',
  rain: 'panels.weather.rain',
  storm: 'panels.weather.storm',
}

export function WorldFooter({ world }: Props) {
  const moodCounts = useMemo(() => {
    let ally = 0,
      rivals = 0,
      neutral = 0
    for (const r of world.tribal_relations ?? []) {
      if (r.status === 'ally') ally++
      else if (r.status === 'rivals') rivals++
      else neutral++
    }
    return { ally, rivals, neutral }
  }, [world.tribal_relations])

  const eraKey = world.current_era ? ERA_KEY[world.current_era] : undefined
  const era = world.current_era ? (eraKey ? t(eraKey) : world.current_era.toUpperCase()) : '-'
  const dayPct = Math.round((world.day_progress ?? 0) * 100)
  const phase = world.is_day ? t('panels.footer.day') : t('panels.footer.night')
  const weatherKind = world.weather?.kind ?? 'clear'
  const weatherKey = WEATHER_KEY[weatherKind]
  const weather = weatherKey ? t(weatherKey) : weatherKind
  const droughtTag = world.drought
    ? t('panels.footer.droughtTag', { label: t('panels.weather.drought') })
    : ''

  return (
    <div className="world-footer">
      <div className="footer-row">
        <span className="footer-label">{t('panels.footer.era')}</span>
        <span className="footer-value era-tag">{era}</span>
      </div>
      <div className="footer-row">
        <span className="footer-label">{phase}</span>
        <div className="footer-bar">
          <div className="footer-bar-fill" style={{ width: `${dayPct}%` }} />
        </div>
      </div>
      <div className="footer-row">
        <span className="footer-label">{t('panels.footer.weather')}</span>
        <span className="footer-value">
          {weather}
          {droughtTag}
        </span>
      </div>
      <div className="footer-row">
        <span className="footer-label">{t('panels.footer.tribes')}</span>
        <span className="footer-value mood">
          <span className="mood-ally">{moodCounts.ally}♥</span>
          <span className="mood-neutral">{moodCounts.neutral}·</span>
          <span className="mood-rivals">{moodCounts.rivals}⚔</span>
        </span>
      </div>
    </div>
  )
}
