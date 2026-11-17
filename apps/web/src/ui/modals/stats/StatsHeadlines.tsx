import clsx from 'clsx'
import type { WorldState } from '../../../shared/types'
import {
  ideasKnown,
  populationStory,
  relationsStory,
  yearStory,
  type Trend,
} from '../../../game/model/stats-story'
import { LOSS_WORDS } from '../../../game/model/tribe-peril'
import { discoveryWord } from '../../sim-words'
import { formatNumber, t } from '../../../i18n'
import { ToolSprite } from '../../toolbar/ToolSprite'

interface CardProps {
  icon: string
  label: string
  value: string
  sub?: string
  trend?: Trend
  tone?: 'good' | 'bad' | 'calm'
  meaning: string
}

const ARROW: Record<Trend, string> = { up: '▲', down: '▼', flat: '■' }

function HeadlineCard({ icon, label, value, sub, trend, tone = 'calm', meaning }: CardProps) {
  return (
    <div className={clsx('stats-headline', `tone-${tone}`)}>
      <div className="stats-headline-top">
        <span className="stats-headline-icon" aria-hidden="true">
          <ToolSprite icon={icon} size={18} />
        </span>
        <span className="stats-headline-label">{label}</span>
      </div>
      <div className="stats-headline-value">{value}</div>
      {sub && (
        <div className={clsx('stats-headline-sub', trend && `trend-${trend}`)}>
          {trend && (
            <span className="stats-headline-arrow" aria-hidden="true">
              {ARROW[trend]}{' '}
            </span>
          )}
          {sub}
        </div>
      )}
      <p className="stats-headline-meaning">{meaning}</p>
    </div>
  )
}

function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n)
}

export function StatsHeadlines({ world }: { world: WorldState }) {
  const pop = populationStory(world)
  const year = yearStory(world.history)
  const ideas = ideasKnown(world.organisms)
  const ties = relationsStory(world)

  const popWhy =
    pop.why === 'deaths'
      ? pop.cause && LOSS_WORDS[pop.cause]
        ? t('dialogs.stats.head.why.deaths', { cause: t(LOSS_WORDS[pop.cause]) })
        : t('dialogs.stats.head.why.deathsUnknown')
      : t(`dialogs.stats.head.why.${pop.why}`)

  const top = ideas.slice(0, 3).map((i) => discoveryWord(i.id))

  return (
    <div className="stats-headlines">
      <HeadlineCard
        icon="👥"
        label={t('dialogs.stats.head.population')}
        value={formatNumber(pop.now)}
        sub={
          pop.span ? t(`dialogs.stats.head.change.${pop.span}`, { change: signed(pop.change) }) : undefined
        }
        trend={pop.span ? pop.trend : undefined}
        tone={pop.trend === 'up' ? 'good' : pop.trend === 'down' ? 'bad' : 'calm'}
        meaning={popWhy}
      />
      <HeadlineCard
        icon="👪"
        label={t('dialogs.stats.head.born')}
        value={formatNumber(year.born)}
        sub={t('dialogs.stats.head.died', { count: formatNumber(year.died) })}
        tone={year.why === 'fewer' ? 'bad' : year.why === 'quiet' ? 'calm' : 'good'}
        meaning={t(`dialogs.stats.head.yearWhy.${year.why}`)}
      />
      <HeadlineCard
        icon="💡"
        label={t('dialogs.stats.head.ideas')}
        value={formatNumber(ideas.length)}
        sub={t('dialogs.stats.head.ideasSub', { count: formatNumber(ideas.length) })}
        meaning={
          top.length > 0
            ? t('dialogs.stats.head.ideasWhy', { list: top.join(', ') })
            : t('dialogs.stats.head.ideasNone')
        }
      />
      <HeadlineCard
        icon={ties.mood === 'war' ? '⚔️' : '🕊️'}
        label={t('dialogs.stats.head.ties')}
        value={formatNumber(ties.mood === 'war' ? ties.wars : ties.allies)}
        sub={
          ties.mood === 'war'
            ? t('dialogs.stats.head.wars', { count: formatNumber(ties.wars) })
            : t('dialogs.stats.head.friendships', { count: formatNumber(ties.allies) })
        }
        tone={ties.mood === 'war' || ties.mood === 'tense' ? 'bad' : ties.mood === 'peace' ? 'good' : 'calm'}
        meaning={t(`dialogs.stats.head.tiesWhy.${ties.mood}`, {
          allies: formatNumber(ties.allies),
          rivals: formatNumber(ties.rivals),
          wars: formatNumber(ties.wars),
        })}
      />
    </div>
  )
}
