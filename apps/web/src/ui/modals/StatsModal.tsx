import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { WorldState } from '../../shared/types'
import { eraWord } from '../../shared/era-words'
import { useFrozenSnapshot } from '../../shared/hooks/useFrozenSnapshot'
import { useNerdStats, useUIStore } from '../../state/store'
import { Modal, ModalHeader } from './Modal'
import { ToolSprite } from '../toolbar/ToolSprite'
import { calendarAt } from '../../game/model/calendar'
import { yearlySeries } from '../../game/model/yearly'
import { legendsOf } from '../../game/model/legends'
import { deathCauses, discoveryMilestones } from '../../game/model/stats-story'
import { eventDate } from '../event-date'
import { DAY_LENGTH } from './stats/constants'
import { PopChart } from './stats/PopChart'
import { YearlyChart } from './stats/YearlyChart'
import { WealthGapChart } from './stats/WealthGapChart'
import { LegendsList } from './stats/LegendsList'
import { RelationsTable } from './stats/RelationsTable'
import { DiscoveryTimeline } from './stats/DiscoveryTimeline'
import { AgePyramid } from './stats/AgePyramid'
import { GenerationBars } from './stats/GenerationBars'
import { OldestList } from './stats/OldestList'
import { longevityLines, longevityOf } from '../../game/model/longevity'
import { TraitAverages } from './stats/TraitAverages'
import { DiscoveryRollup } from './stats/DiscoveryRollup'
import { BondStats } from './stats/BondStats'
import { NotableOrgs } from './stats/NotableOrgs'
import { StatsHeadlines } from './stats/StatsHeadlines'
import { DeathCauses, IdeaChips, StatSection, TraitWords } from './stats/StoryParts'
import { formatNumber, t } from '../../i18n'
import { knownTribeName } from '../../state/worldStore'
import './stats/stats-story.css'

interface Props {
  world: WorldState
  onClose: () => void
}

const TABS = ['people', 'tribes', 'world', 'records'] as const
type Tab = (typeof TABS)[number]

const TAB_ICON: Record<Tab, string> = { people: '👥', tribes: '🏘️', world: '🗺️', records: '⭐' }

export function StatsModal({ world: liveWorld, onClose }: Props) {
  const { frozen: world, reload } = useFrozenSnapshot(() => liveWorld)
  const nerdStats = useNerdStats()
  const openCiv = useUIStore((s) => s.openCiv)
  const [tab, setTab] = useState<Tab>('people')
  const living = world.organisms.filter((o) => o.alive)
  const liveCount = living.length
  const currentDay = Math.floor(world.tick / DAY_LENGTH)
  const history = world.history

  const popHistory = world.pop_history ?? []
  const years = yearlySeries(history.births_by_year ?? [], history.deaths_by_year ?? [])
  const wealth = history.wealth_gap_by_year ?? []
  const relations = world.tribal_relations ?? []
  const causes = deathCauses(history as unknown as Record<string, unknown>)
  const legends = legendsOf(world.events ?? [])
  const milestones = discoveryMilestones(world.events ?? [])
  const longevity = longevityOf(world.organisms)
  const eras = history.era_history ?? []
  const totalDeaths = causes.reduce((n, c) => n + c.count, 0)

  const people = (
    <>
      {popHistory.length >= 3 && (
        <StatSection
          title={t('dialogs.stats.sec.population')}
          tip={t('dialogs.stats.sec.populationTip')}
          wide
        >
          <div className="stats-chart-wrap">
            <PopChart history={popHistory} />
          </div>
        </StatSection>
      )}
      {years.length >= 2 && (
        <StatSection
          title={t('dialogs.stats.sec.birthsDeaths')}
          tip={t('dialogs.stats.sec.birthsDeathsTip')}
          wide
        >
          <div className="stats-chart-wrap">
            <YearlyChart births={history.births_by_year ?? []} deaths={history.deaths_by_year ?? []} />
          </div>
        </StatSection>
      )}
      {liveCount > 0 && (
        <StatSection title={t('dialogs.stats.sec.ages')} tip={t('dialogs.stats.sec.agesTip')}>
          <AgePyramid organisms={living} />
        </StatSection>
      )}
      {liveCount > 0 && (
        <StatSection title={t('dialogs.stats.sec.families')}>
          <BondStats organisms={living} />
        </StatSection>
      )}
      {liveCount > 0 && (
        <StatSection title={t('dialogs.stats.sec.personality')} tip={t('dialogs.stats.sec.personalityTip')}>
          <TraitWords organisms={living} />
        </StatSection>
      )}
      {nerdStats && liveCount > 0 && (
        <>
          <StatSection title={t('dialogs.stats.populationTraits')}>
            <TraitAverages organisms={living} />
          </StatSection>
          <StatSection title={t('dialogs.stats.generationsAlive')}>
            <GenerationBars organisms={living} />
          </StatSection>
        </>
      )}
    </>
  )

  const tribes = (
    <>
      {relations.length > 0 && (
        <StatSection title={t('dialogs.stats.sec.relations')} tip={t('dialogs.stats.sec.relationsTip')} wide>
          <RelationsTable
            relations={relations}
            lineageSizes={world.lineage_sizes ?? []}
            lineageNames={world.lineage_names}
          />
        </StatSection>
      )}
      <StatSection title={t('dialogs.stats.sec.tribeDetails')} wide>
        <p className="stats-note">{t('dialogs.stats.sec.tribeDetailsBody')}</p>
        <button
          type="button"
          className="lang-btn stats-civ-link"
          onClick={() => {
            onClose()
            openCiv()
          }}
        >
          <ToolSprite icon="👑" size={12} /> {t('dialogs.stats.sec.openCiv')}
        </button>
      </StatSection>
    </>
  )

  const worldTab = (
    <>
      {causes.length > 0 && (
        <StatSection title={t('dialogs.stats.sec.deaths')} tip={t('dialogs.stats.sec.deathsTip')}>
          <DeathCauses history={history} />
        </StatSection>
      )}
      {liveCount > 0 && living.some((o) => (o.discoveries ?? []).length > 0) && (
        <StatSection title={t('dialogs.stats.sec.ideas')} tip={t('dialogs.stats.sec.ideasTip')}>
          <IdeaChips organisms={world.organisms} />
        </StatSection>
      )}
      {wealth.length >= 2 && (
        <StatSection title={t('dialogs.stats.sec.wealth')} tip={t('dialogs.stats.sec.wealthTip')} wide>
          <div className="stats-chart-wrap">
            <WealthGapChart values={wealth} />
          </div>
        </StatSection>
      )}
      {eras.length > 0 && (
        <StatSection title={t('dialogs.stats.sec.eras')} tip={t('dialogs.stats.sec.erasTip')}>
          <div className="stats-timeline">
            {[...eras]
              .reverse()
              .slice(0, 12)
              .map((e, i) => (
                <div key={i} className="stats-timeline-row">
                  <span className="stats-tick">{eventDate(e.tick)}</span>
                  <span className={`era-badge era-${e.era}`} style={{ fontSize: 9 }}>
                    {eraWord(e.era)}
                  </span>
                </div>
              ))}
          </div>
        </StatSection>
      )}
      {nerdStats && (
        <>
          <StatSection title={t('dialogs.stats.discoveryRollup')}>
            <DiscoveryRollup organisms={living} />
          </StatSection>
          <StatSection title={t('dialogs.stats.sec.totals')}>
            <div className="stats-death-grid">
              {(
                [
                  ['dialogs.stats.alive', liveCount],
                  ['dialogs.stats.totalBirths', history.births],
                  ['dialogs.stats.totalDeaths', totalDeaths],
                  ['dialogs.stats.daysElapsed', currentDay],
                  ['dialogs.stats.causes.droughts', history.droughts],
                  ['dialogs.stats.causes.outbreaks', history.outbreaks],
                  ['panels.history.alliances', history.alliances_formed],
                  ['panels.history.challenges', history.challenges_total],
                  ['panels.history.gifts', history.gifts_total],
                ] as const
              ).map(([label, value]) => (
                <span key={label} style={{ display: 'contents' }}>
                  <span className="hist-label">{t(label)}</span>
                  <span className="hist-val">{formatNumber(value ?? 0)}</span>
                </span>
              ))}
            </div>
          </StatSection>
        </>
      )}
    </>
  )

  const hasRecords = liveCount > 0 || longevity.deaths > 0 || legends.length > 0 || milestones.length > 0
  const records = (
    <>
      {liveCount > 0 && (
        <StatSection title={t('dialogs.stats.sec.oldest')}>
          <OldestList organisms={living} lineageNames={world.lineage_names} />
        </StatSection>
      )}
      {longevity.deaths > 0 && (
        <StatSection title={t('dialogs.stats.sec.longevity')} tip={t('dialogs.stats.sec.longevityTip')}>
          {longevityLines(longevity, (l) => knownTribeName(world.lineage_names, l) ?? l.slice(0, 6)).map(
            (line) => (
              <div key={line} className="stats-line">
                {line}
              </div>
            ),
          )}
        </StatSection>
      )}
      {legends.length > 0 && (
        <StatSection title={t('dialogs.stats.sec.legends')} tip={t('dialogs.stats.sec.legendsTip')}>
          <LegendsList events={world.events ?? []} />
        </StatSection>
      )}
      {milestones.length > 0 && (
        <StatSection title={t('dialogs.stats.sec.discoveries')}>
          <DiscoveryTimeline events={world.events ?? []} />
        </StatSection>
      )}
      {nerdStats && liveCount > 0 && (
        <StatSection title={t('dialogs.stats.notableOrganisms')}>
          <NotableOrgs organisms={living} />
        </StatSection>
      )}
      {!hasRecords && <p className="stats-note">{t('dialogs.stats.sec.emptyRecords')}</p>}
    </>
  )

  const panels: Record<Tab, ReactNode> = { people, tribes, world: worldTab, records }

  return (
    <Modal open onClose={onClose} className="stats-modal" title={t('dialogs.stats.title')} hideTitle>
      <ModalHeader
        title={t('dialogs.stats.heading')}
        sub={
          <>
            {world.cosmos ? (
              <>
                {t('dialogs.stats.yearDay', {
                  year: formatNumber(calendarAt(world.tick).year),
                  day: formatNumber(calendarAt(world.tick).dayOfSeason),
                })}{' '}
                ·{' '}
              </>
            ) : (
              <>{t('dialogs.stats.day', { day: formatNumber(currentDay) })} · </>
            )}
            {t('dialogs.stats.aliveCount', { count: formatNumber(liveCount) })}
          </>
        }
        onClose={onClose}
        closeLabel={t('dialogs.stats.close')}
      >
        <button
          className="reload-btn"
          onClick={reload}
          title={t('dialogs.stats.reload')}
          aria-label={t('dialogs.stats.reload')}
        >
          ⟳
        </button>
      </ModalHeader>

      <div className="stats-body">
        <StatsHeadlines world={world} />
        <div className="stats-tabs" role="tablist" aria-label={t('dialogs.stats.tabsAria')}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`stats-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`stats-panel-${id}`}
              className={clsx('stats-tab', tab === id && 'active')}
              onClick={() => setTab(id)}
            >
              <ToolSprite icon={TAB_ICON[id]} size={14} />
              <span>{t(`dialogs.stats.tabs.${id}`)}</span>
            </button>
          ))}
        </div>
        <div
          className="stats-story-grid"
          role="tabpanel"
          id={`stats-panel-${tab}`}
          aria-labelledby={`stats-tab-${tab}`}
        >
          {panels[tab]}
        </div>
      </div>
    </Modal>
  )
}
