import type { WorldState } from '../../../shared/types'
import { calendarAt } from '../../../game/model/calendar'
import { eraWord } from '../../../shared/era-words'
import { formatNumber, t, type MessageKey } from '../../../i18n'
import { ToolSprite } from '../../toolbar/ToolSprite'
import { Tooltip } from '../../toolbar/Tooltip'
import { calendarTagParts, DAY_PHASE_ICON } from '../calendar-tag'
import { SectionHead } from './InfoTip'

const SEASON_ICON: Record<string, string> = {
  spring: '🌸',
  summer: '🌞',
  autumn: '🥀',
  winter: '❄️',
}

const WEATHER: Record<string, { icon?: string; line: MessageKey }> = {
  clear: { line: 'panels.world.now.weather.clear' },
  rain: { icon: '🌧️', line: 'panels.world.now.weather.rain' },
  storm: { icon: '⛈️', line: 'panels.world.now.weather.storm' },
  snow: { icon: '🌨️', line: 'panels.world.now.weather.snow' },
  fog: { icon: '🌫️', line: 'panels.world.now.weather.fog' },
  wet: { icon: '💧', line: 'panels.world.now.weather.wet' },
}

type NowWorld = Pick<
  WorldState,
  | 'tick'
  | 'season'
  | 'is_day'
  | 'day_progress'
  | 'hard_winter'
  | 'hard_winter_ahead'
  | 'weather'
  | 'drought'
  | 'current_era'
  | 'lineage_sizes'
  | 'organisms'
>

export function WorldNow({ world }: { world: NowWorld }) {
  const parts = calendarTagParts(world)
  const seasonKey = calendarAt(world.tick).season.toLowerCase()
  const weather = WEATHER[world.weather?.kind ?? 'clear'] ?? WEATHER.clear
  const people = world.organisms.filter((o) => o.alive).length
  const tribes = (world.lineage_sizes ?? []).filter((l) => l.count > 0).length
  const era = world.current_era
  const young = !era || era === 'genesis' || era === 'equilibrium'

  const icons: { icon: string; label: string }[] = [
    { icon: parts.hardWinter ? '🥶' : (SEASON_ICON[seasonKey] ?? '🌞'), label: parts.seasonWord },
    { icon: DAY_PHASE_ICON[parts.phase], label: parts.phaseWord },
  ]
  if (weather.icon) icons.push({ icon: weather.icon, label: t(weather.line) })
  if (world.drought) icons.push({ icon: '🏜️', label: t('panels.world.now.drought') })

  return (
    <section className="wp-now" aria-labelledby="wp-now-title">
      <SectionHead title={t('panels.world.now.title')} />
      <div className="wp-now-card">
        <div className="wp-now-icons" aria-hidden="true">
          {icons.map((i) => (
            <span key={i.icon} className="wp-now-icon" title={i.label}>
              <ToolSprite icon={i.icon} size={22} />
            </span>
          ))}
        </div>
        <p className="wp-now-when" id="wp-now-title">
          {t('panels.world.now.when', {
            year: formatNumber(parts.year),
            season: parts.seasonWord,
            phase: parts.phaseWord,
          })}
        </p>
        <p className="wp-now-line">
          {t(weather.line)}
          {world.drought && <> {t('panels.world.now.drought')}</>}
          {parts.hardWinter && <> {t('panels.world.now.hardWinter')}</>}
          {parts.hardWinterAhead && <> {t('panels.world.now.hardWinterAhead')}</>}
        </p>
        {people > 0 && (
          <p className="wp-now-line">
            {t('panels.world.now.peopleLine', {
              people: t('panels.world.now.people', { count: formatNumber(people) }),
              tribes: t('panels.world.now.tribes', { count: formatNumber(tribes) }),
            })}
          </p>
        )}
        <Tooltip tip={t('panels.world.now.ageTip')}>
          <p className="wp-now-line wp-now-age" tabIndex={0}>
            {young ? t('panels.world.now.ageYoung') : t('panels.world.now.age', { era: eraWord(era) })}
          </p>
        </Tooltip>
      </div>
    </section>
  )
}
