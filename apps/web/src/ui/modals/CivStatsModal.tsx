import { useMemo, useState } from 'react'
import type { WorldState } from '../../shared/types'
import type { LineageStrategy } from '../../simulation/sandbox'
import { Modal } from './Modal'
import { askConfirm } from '../../shared/confirm'
import { normalizeLineageEras } from '../../shared/lineageEras'
import { useSceneStore } from '../../state/scene'
import { farmStage } from '../../game/model/farms'
import { getBuildingState } from '../../game/model/building-state'
import { formatNumber, t, type MessageKey } from '../../i18n'

interface Props {
  world: WorldState
  onClose: () => void
  onGuide?: (lineageId: string, strategy: LineageStrategy) => Promise<boolean>
}

const GUIDANCE: Array<{
  value: LineageStrategy
  label: MessageKey
  description: MessageKey
  reward: MessageKey
}> = [
  {
    value: 'hunt',
    label: 'dialogs.civ.guidance.hunt.label',
    description: 'dialogs.civ.guidance.hunt.description',
    reward: 'dialogs.civ.guidance.hunt.reward',
  },
  {
    value: 'explore',
    label: 'dialogs.civ.guidance.explore.label',
    description: 'dialogs.civ.guidance.explore.description',
    reward: 'dialogs.civ.guidance.explore.reward',
  },
  {
    value: 'settle',
    label: 'dialogs.civ.guidance.settle.label',
    description: 'dialogs.civ.guidance.settle.description',
    reward: 'dialogs.civ.guidance.settle.reward',
  },
  {
    value: 'trade',
    label: 'dialogs.civ.guidance.trade.label',
    description: 'dialogs.civ.guidance.trade.description',
    reward: 'dialogs.civ.guidance.trade.reward',
  },
  {
    value: 'defend',
    label: 'dialogs.civ.guidance.defend.label',
    description: 'dialogs.civ.guidance.defend.description',
    reward: 'dialogs.civ.guidance.defend.reward',
  },
]

const CAMPAIGN_OUTCOME: Record<'completed' | 'expired' | 'redirected' | 'failed', MessageKey> = {
  completed: 'dialogs.civ.history.outcome.completed',
  expired: 'dialogs.civ.history.outcome.expired',
  redirected: 'dialogs.civ.history.outcome.redirected',
  failed: 'dialogs.civ.history.outcome.failed',
}

function strategyLabel(value: string): string {
  const meta = GUIDANCE.find((entry) => entry.value === value)
  return meta ? t(meta.label) : value
}

function hasEnterableBuilding(world: WorldState, kinds: ReadonlySet<string>, lineageId: string): boolean {
  const matching = (world.buildings ?? []).filter((building) => {
    if (!kinds.has(building.kind.toLowerCase())) return false
    const owner = building.lineage_id ?? building.owner_lineage
    return !owner || owner === lineageId
  })
  // Older snapshots did not carry all building records and use the scene
  // resolver's lineage-centroid fallback. Only an explicitly ruined record
  // suppresses that legacy path.
  return matching.length === 0 || matching.some((building) => getBuildingState(building).isOperational)
}

const TAVERN_BUILDINGS = new Set(['tavern'])
const TEMPLE_BUILDINGS = new Set(['temple', 'cathedral', 'shrine', 'mosque', 'synagogue', 'pagoda'])

const ERA_EMOJI: Record<string, string> = {
  'pre-stone': '\u{1F33F}',
  stone: '\u{1FAA8}',
  bronze: '\u{1F33E}',
  iron: '\u{2694}\u{FE0F}',
  classical: '\u{1F3DB}\u{FE0F}',
  medieval: '\u{1F3F0}',
  renaissance: '\u{1F3A8}',
  industrial: '\u{1F3ED}',
  modern: '\u{1F697}',
  information: '\u{1F4BB}',
}

const GOV_EMOJI: Record<string, string> = {
  tribal: '\u{1F525}',
  chiefdom: '\u{1FAA9}',
  monarchy: '\u{1F451}',
  theocracy: '\u{271D}\u{FE0F}',
  republic: '\u{1F3DB}\u{FE0F}',
  democracy: '\u{1F5F3}\u{FE0F}',
  empire: '\u{1F985}',
  federation: '\u{1F30E}',
  corporate: '\u{1F3E2}',
}

const GOOD_EMOJI: Record<string, string> = {
  food: '\u{1F35E}',
  water: '\u{1F4A7}',
  wood: '\u{1FAB5}',
  stone: '\u{1FAA8}',
  iron: '\u{1F528}',
  cloth: '\u{1F9F5}',
  bread: '\u{1F35E}',
  spirit: '\u{1F943}',
  aged_spirit: '\u{1F6E2}\u{FE0F}',
  bottled_spirit: '\u{1F37E}',
  blended_spirit: '\u{1F377}',
  bottle: '\u{1F376}',
  meat: '\u{1F969}',
  cuts: '\u{1F52A}',
  ground: '\u{1F356}',
  sausage: '\u{1F32D}',
  preserved: '\u{1F9C2}',
  preserved_meat: '\u{1F9C2}',
  pattern: '\u{1F4D0}',
  piece: '\u{1F9F5}',
  garment: '\u{1F455}',
  article: '\u{1F4F0}',
  drink: '\u{1F375}',
  pastry: '\u{1F950}',
  coffee: '\u{2615}',
  stock: '\u{1F4E6}',
}

const ART_EMOJI: Record<string, string> = {
  cave_painting: '\u{1F58C}\u{FE0F}',
  sculpture: '\u{1F5FF}',
  fresco: '\u{1F3DB}\u{FE0F}',
  painting: '\u{1F5BC}\u{FE0F}',
  photograph: '\u{1F4F7}',
  film: '\u{1F3AC}',
  digital: '\u{1F5A5}\u{FE0F}',
}

export function CivStatsModal({ world, onClose, onGuide }: Props) {
  const [guidanceBusy, setGuidanceBusy] = useState<Record<string, boolean>>({})
  const [guidanceResult, setGuidanceResult] = useState<Record<string, string>>({})
  const [showAllCampaigns, setShowAllCampaigns] = useState(false)
  const lineages = world.lineage_sizes ?? []
  const lineageNames = world.lineage_names ?? {}
  const lineageEras = normalizeLineageEras(world.lineage_eras)
  const eraProgress = new Map((world.lineage_era_progress ?? []).map((p) => [p.lineage_id, p]))
  const currencies = (world.lineage_currencies ?? {}) as Record<string, string>
  const governments = world.governments ?? []
  const religions = world.religions ?? []
  const books = world.books ?? []
  const artworks = world.artworks ?? []
  const headlines = world.headlines ?? []
  const battles = world.battles ?? []
  const treaties = world.treaties ?? []
  const campaignHistory = world.lineage_strategy_history ?? []
  const tradeRoutes = world.trade_routes ?? []
  const caravans = world.caravans ?? []

  const lineageById = (lid: string) => lineageNames[lid] ?? lid.slice(0, 6)
  const activeStrategyFor = (lineageId: string) => {
    const strategy = world.lineage_strategies?.[lineageId]
    return strategy && strategy.expires_tick > world.tick ? strategy : undefined
  }
  const guideLineage = async (lineageId: string, strategy: LineageStrategy) => {
    if (!onGuide || guidanceBusy[lineageId]) return
    const active = activeStrategyFor(lineageId)
    if (
      active &&
      !active.completed &&
      active.strategy !== strategy &&
      !(await askConfirm({
        title: t('dialogs.civ.redirect.title'),
        body: t('dialogs.civ.redirect.body', {
          lineage: lineageById(lineageId),
          from: strategyLabel(active.strategy),
          to: strategyLabel(strategy),
        }),
        confirmLabel: t('dialogs.civ.redirect.confirm'),
      }))
    ) {
      return
    }

    setGuidanceBusy((current) => ({ ...current, [lineageId]: true }))
    setGuidanceResult((current) => ({ ...current, [lineageId]: t('dialogs.civ.guidance.guiding') }))
    void onGuide(lineageId, strategy)
      .then((ok) => {
        setGuidanceResult((current) => ({
          ...current,
          [lineageId]: ok
            ? t('dialogs.civ.guidance.started', { strategy: strategyLabel(strategy) })
            : t('dialogs.civ.guidance.rejected'),
        }))
      })
      .catch(() => {
        setGuidanceResult((current) => ({ ...current, [lineageId]: t('dialogs.civ.guidance.unavailable') }))
      })
      .finally(() => {
        setGuidanceBusy((current) => ({ ...current, [lineageId]: false }))
      })
  }
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of world.organisms) m.set(o.id, o.name)
    return m
  }, [world.organisms])
  const orgById = (id: string | null | undefined) => {
    if (!id) return null
    return nameById.get(id) ?? id.slice(0, 6)
  }

  const { buildingRows, buildingOverflow } = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const b of world.buildings ?? []) {
      counts[b.kind] = (counts[b.kind] ?? 0) + 1
    }
    const all = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const CAP = 28
    return { buildingRows: all.slice(0, CAP), buildingOverflow: all.length - Math.min(all.length, CAP) }
  }, [world.buildings])

  const farmSummary = useMemo(() => {
    const stages = { fallow: 0, growing: 0, mature: 0 }
    const crops = new Map<string, number>()
    let projectedYield = 0
    for (const farm of world.farms ?? []) {
      const stage = farmStage(farm, world.tick)
      if (stage === 'fallow' || stage === 'harvested') stages.fallow++
      else if (stage === 'mature') stages.mature++
      else stages.growing++
      if (farm.crop && stage !== 'fallow' && stage !== 'harvested') {
        crops.set(farm.crop, (crops.get(farm.crop) ?? 0) + 1)
      }
      if (stage === 'mature') projectedYield += farm.yield ?? 0
    }
    return {
      stages,
      projectedYield,
      crops: [...crops.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [world.farms, world.tick])

  const { goodsByLineage, goodsTotalRows, goodsOverflow } = useMemo(() => {
    const isDisplayableGood = (k: string) => /^[a-z][a-z0-9_]*$/.test(k)
    const byLineage = new Map<string, Map<string, number>>()
    for (const o of world.organisms) {
      if (!o.alive || !o.tools) continue
      const lid = o.lineage_id
      let bag = byLineage.get(lid)
      if (!bag) {
        bag = new Map<string, number>()
        byLineage.set(lid, bag)
      }
      for (const [k, v] of Object.entries(o.tools)) {
        if (!v || !isDisplayableGood(k)) continue
        bag.set(k, (bag.get(k) ?? 0) + v)
      }
    }
    const totals = new Map<string, number>()
    for (const bag of byLineage.values()) {
      for (const [k, v] of bag) {
        totals.set(k, (totals.get(k) ?? 0) + v)
      }
    }
    const CAP = 36
    const all = [...totals.entries()].sort((a, b) => b[1] - a[1])
    return {
      goodsByLineage: byLineage,
      goodsTotalRows: all.slice(0, CAP),
      goodsOverflow: all.length - Math.min(all.length, CAP),
    }
  }, [world.organisms])

  const moonGlyphs: Record<string, string> = {
    new_moon: '🌑',
    waxing_crescent: '🌒',
    first_quarter: '🌓',
    waxing_gibbous: '🌔',
    full_moon: '🌕',
    waning_gibbous: '🌖',
    last_quarter: '🌗',
    waning_crescent: '🌘',
  }

  return (
    <Modal open onClose={onClose} className="civ-modal" title={'\u{1F30D} ' + t('dialogs.civ.title')}>
      <button aria-label={t('dialogs.civ.close')} className="close-btn civ-close" onClick={onClose}>
        ✕
      </button>
      {world.cosmos && (
        <div className="civ-calendar">
          <div className="civ-cal-item">
            <span className="civ-cal-label">{t('dialogs.civ.calendar.year')}</span>
            <span className="civ-cal-value">{world.cosmos.year + 1}</span>
            <span className="civ-cal-sub">
              {t('dialogs.civ.calendar.day', { day: formatNumber(world.cosmos.day_of_year + 1) })}
            </span>
          </div>
          <span className="civ-cal-sep" aria-hidden="true" />
          <div className="civ-cal-item">
            <span className="civ-cal-moon">{moonGlyphs[world.cosmos.moon_phase] ?? '🌑'}</span>
            <span className="civ-cal-value">{world.cosmos.moon_phase.replace(/_/g, ' ')}</span>
            <span className="civ-cal-sub">
              {t('dialogs.civ.calendar.lit', {
                percent: formatNumber(Math.round(world.cosmos.moon_illum * 100)),
              })}
            </span>
          </div>
          <span className="civ-cal-sep" aria-hidden="true" />
          <div className="civ-cal-item">
            <span className="civ-cal-label">{t('dialogs.civ.calendar.season')}</span>
            <span className="civ-cal-value">{world.season}</span>
          </div>
          {world.current_era && (
            <>
              <span className="civ-cal-sep" aria-hidden="true" />
              <div className="civ-cal-item">
                <span className="civ-cal-label">{t('dialogs.civ.calendar.worldTech')}</span>
                <span className="civ-cal-value">{world.current_era}</span>
              </div>
            </>
          )}
        </div>
      )}
      <div className="civ-modal-grid">
        <div className="civ-cols">
          <section className="civ-section civ-section--span">
            <h3>{t('dialogs.civ.lineages.heading')}</h3>
            <div className="civ-table-wrap">
              <table className="civ-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader">{t('dialogs.civ.lineages.name')}</th>
                    <th role="columnheader">{t('dialogs.civ.lineages.era')}</th>
                    <th role="columnheader">{t('dialogs.civ.lineages.pop')}</th>
                    <th role="columnheader">{t('dialogs.civ.lineages.next')}</th>
                    <th role="columnheader">{t('dialogs.civ.lineages.gov')}</th>
                    <th role="columnheader">{t('dialogs.civ.lineages.currency')}</th>
                    <th role="columnheader" aria-label={t('dialogs.civ.lineages.actions')}></th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {lineages.slice(0, 12).map((l) => {
                    const era = lineageEras[l.id] ?? 'pre-stone'
                    const progress = eraProgress.get(l.id)
                    const worldPopulation = progress?.world_population ?? progress?.pop ?? 0
                    const worldPopulationRequired =
                      progress?.world_population_required ?? progress?.pop_required ?? 0
                    const worldPopulationReady =
                      progress?.world_population_ready ?? progress?.pop_ready ?? true
                    const gov = governments.find((g) => g.lineage_id === l.id)
                    const activeStrategy = activeStrategyFor(l.id)
                    const objectiveProgress = activeStrategy?.progress ?? 0
                    const objectiveTarget = activeStrategy?.target ?? 0
                    const objectivePercent =
                      objectiveTarget > 0
                        ? Math.max(0, Math.min(100, Math.round((objectiveProgress / objectiveTarget) * 100)))
                        : 0
                    // `discoveries` is a cold field the server omits with
                    // `skip_serializing_if`, so it is genuinely absent on
                    // periodic full frames. `OrgCard` and the other 15 call
                    // sites already guard this; this was the one that did
                    // not, and a throw here propagates to the top-level
                    // ErrorBoundary and replaces the whole app.
                    const hasBrewing = world.organisms.some(
                      (o) => o.alive && o.lineage_id === l.id && (o.discoveries ?? []).includes('brewing'),
                    )
                    const canEnterTavern = hasEnterableBuilding(world, TAVERN_BUILDINGS, l.id)
                    return (
                      <tr key={l.id} role="row">
                        <td role="cell" data-label={t('dialogs.civ.lineages.name')}>
                          {lineageById(l.id)}
                        </td>
                        <td role="cell" data-label={t('dialogs.civ.lineages.era')}>
                          {ERA_EMOJI[era] ?? ''} {era}
                        </td>
                        <td role="cell" data-label={t('dialogs.civ.lineages.pop')}>
                          {formatNumber(l.count)}
                        </td>
                        <td role="cell" data-label={t('dialogs.civ.lineages.next')}>
                          {progress?.next_era ? (
                            <div className="civ-era-progress">
                              <span className={progress.ready ? 'civ-era-ready' : 'civ-era-next'}>
                                {progress.next_era}
                              </span>
                              {!worldPopulationReady && (
                                <span className="civ-era-gate">
                                  {t('dialogs.civ.lineages.worldPopulation', {
                                    current: formatNumber(worldPopulation),
                                    required: formatNumber(worldPopulationRequired),
                                  })}
                                </span>
                              )}
                              {progress.missing.length > 0 && (
                                <span className="civ-era-missing">
                                  {t('dialogs.civ.lineages.missing', {
                                    items: progress.missing.slice(0, 3).join(', '),
                                  })}
                                  {progress.missing.length > 3 ? ' +' : ''}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="civ-era-next">-</span>
                          )}
                        </td>
                        <td role="cell" data-label={t('dialogs.civ.lineages.gov')}>
                          {gov ? `${GOV_EMOJI[gov.kind] ?? ''} ${gov.kind}` : '-'}
                        </td>
                        <td role="cell" data-label={t('dialogs.civ.lineages.currency')}>
                          {currencies[l.id] ?? '-'}
                        </td>
                        <td
                          role="cell"
                          data-label={t('dialogs.civ.lineages.actions')}
                          className={
                            activeStrategy || (hasBrewing && canEnterTavern)
                              ? 'civ-cell-actions'
                              : 'civ-cell-actions civ-cell-actions--empty'
                          }
                        >
                          <div className="civ-lineage-actions">
                            {activeStrategy && (
                              <span
                                className={
                                  activeStrategy.completed
                                    ? 'civ-strategy-active civ-strategy-complete'
                                    : 'civ-strategy-active'
                                }
                              >
                                {strategyLabel(activeStrategy.strategy)} {formatNumber(objectivePercent)}%
                              </span>
                            )}
                            {hasBrewing && canEnterTavern && (
                              <button
                                className="civ-row-link"
                                onClick={() => {
                                  useSceneStore.getState().enter({ kind: 'tavern', lineageId: l.id })
                                  onClose()
                                }}
                              >
                                🍻 {t('dialogs.civ.lineages.tavern')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="civ-campaign-board">
              <div className="civ-campaign-board-heading">
                <div>
                  <span className="civ-campaign-board-kicker">{t('dialogs.civ.campaigns.kicker')}</span>
                  <h4>{t('dialogs.civ.campaigns.heading')}</h4>
                </div>
                <span className="civ-campaign-board-help">{t('dialogs.civ.campaigns.help')}</span>
              </div>
              <div className="civ-campaign-cards">
                {lineages.map((lineage) => {
                  const active = activeStrategyFor(lineage.id)
                  const meta = GUIDANCE.find((entry) => entry.value === active?.strategy)
                  const progress = active?.progress ?? 0
                  const target = active?.target ?? 0
                  const percent =
                    target > 0 ? Math.max(0, Math.min(100, Math.round((progress / target) * 100))) : 0
                  const remaining = active ? Math.max(0, active.expires_tick - world.tick) : 0
                  return (
                    <article
                      key={lineage.id}
                      className={`civ-campaign-card${active?.completed ? ' completed' : ''}`}
                    >
                      <div className="civ-campaign-card-head">
                        <div>
                          <span className="civ-campaign-lineage">{lineageById(lineage.id)}</span>
                          <span className="civ-campaign-pop">
                            {t('dialogs.civ.common.people', { count: formatNumber(lineage.count) })}
                          </span>
                        </div>
                        {active ? (
                          <span className="civ-campaign-badge">
                            {active.completed
                              ? t('dialogs.civ.campaigns.completed')
                              : meta
                                ? t(meta.label)
                                : active.strategy}
                          </span>
                        ) : (
                          <span className="civ-campaign-badge idle">
                            {t('dialogs.civ.campaigns.awaiting')}
                          </span>
                        )}
                      </div>

                      {active ? (
                        <>
                          <p className="civ-campaign-description">
                            {meta
                              ? t(meta.description)
                              : t('dialogs.civ.campaigns.focusOn', {
                                  strategy: strategyLabel(active.strategy),
                                })}
                          </p>
                          <div className="civ-campaign-progress-copy">
                            <span>
                              {t('dialogs.civ.campaigns.aligned', {
                                progress: formatNumber(progress),
                                target: formatNumber(target),
                              })}
                            </span>
                            <span>
                              {active.completed
                                ? t('dialogs.civ.campaigns.rewardEarned')
                                : t('dialogs.civ.campaigns.ticksLeft', { ticks: formatNumber(remaining) })}
                            </span>
                          </div>
                          <span
                            className="civ-campaign-card-progress"
                            role="progressbar"
                            aria-label={t('dialogs.civ.campaigns.progressAria', {
                              lineage: lineageById(lineage.id),
                              strategy: strategyLabel(active.strategy),
                            })}
                            aria-valuemin={0}
                            aria-valuemax={target}
                            aria-valuenow={Math.min(progress, target)}
                          >
                            <span style={{ width: `${percent}%` }} />
                          </span>
                          <span className="civ-campaign-reward">
                            {t('dialogs.civ.campaigns.reward', {
                              reward: meta ? t(meta.reward) : t('dialogs.civ.campaigns.defaultReward'),
                            })}
                          </span>
                        </>
                      ) : (
                        <p className="civ-campaign-description">{t('dialogs.civ.campaigns.choose')}</p>
                      )}

                      <div className="civ-campaign-card-actions">
                        {onGuide && (
                          <select
                            className="civ-guide-select"
                            aria-label={t('dialogs.civ.campaigns.guideAria', {
                              lineage: lineageById(lineage.id),
                            })}
                            value=""
                            disabled={Boolean(guidanceBusy[lineage.id])}
                            onChange={(event) => {
                              const strategy = event.target.value as LineageStrategy
                              if (strategy) guideLineage(lineage.id, strategy)
                            }}
                          >
                            <option value="">
                              {active ? t('dialogs.civ.campaigns.change') : t('dialogs.civ.campaigns.start')}
                            </option>
                            {GUIDANCE.map((strategy) => (
                              <option key={strategy.value} value={strategy.value}>
                                {t(strategy.label)}
                              </option>
                            ))}
                          </select>
                        )}
                        {guidanceResult[lineage.id] && (
                          <span className="civ-strategy-status" role="status">
                            {guidanceResult[lineage.id]}
                          </span>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
            {campaignHistory.length > 0 && (
              <div className="civ-campaign-history">
                <div className="civ-campaign-history-head">
                  <span className="civ-campaign-history-title">{t('dialogs.civ.history.title')}</span>
                  {campaignHistory.length > 6 && (
                    <button
                      type="button"
                      className="civ-campaign-history-toggle"
                      onClick={() => setShowAllCampaigns((current) => !current)}
                    >
                      {showAllCampaigns
                        ? t('dialogs.civ.history.showRecent')
                        : t('dialogs.civ.history.showAll', { count: formatNumber(campaignHistory.length) })}
                    </button>
                  )}
                </div>
                <div className="civ-campaign-history-list">
                  {(showAllCampaigns ? campaignHistory : campaignHistory.slice(0, 6)).map((campaign) => {
                    const icon =
                      campaign.outcome === 'completed' ? '✓' : campaign.outcome === 'redirected' ? '↪' : '×'
                    return (
                      <div
                        key={`${campaign.lineage_id}:${campaign.started_tick}:${campaign.ended_tick}:${campaign.strategy}:${campaign.outcome}`}
                        className={`civ-campaign-record civ-campaign-record--${campaign.outcome}`}
                      >
                        <span className="civ-campaign-outcome" aria-hidden="true">
                          {icon}
                        </span>
                        <span className="civ-campaign-name">
                          {campaign.lineage_name || lineageById(campaign.lineage_id)} ·{' '}
                          {strategyLabel(campaign.strategy)}
                        </span>
                        <span className="civ-campaign-result">
                          {campaign.reason === 'lineage_extinct'
                            ? t('dialogs.civ.history.lineageEnded')
                            : t(CAMPAIGN_OUTCOME[campaign.outcome])}
                        </span>
                        <span className="civ-campaign-effort">
                          {formatNumber(campaign.progress)}/{formatNumber(campaign.target)}
                        </span>
                        <span className="civ-campaign-tick">
                          {t('dialogs.civ.history.tick', { tick: formatNumber(campaign.ended_tick) })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.governments.heading')}</h3>
            {governments.length === 0 && (
              <div className="civ-empty">{t('dialogs.civ.governments.empty')}</div>
            )}
            {governments.map((g) => (
              <div key={g.lineage_id} className="civ-row">
                <span className="civ-row-head">
                  {GOV_EMOJI[g.kind] ?? ''} {g.kind}
                </span>
                <span className="civ-row-sub">{lineageById(g.lineage_id)}</span>
                {g.leader_id && (
                  <span className="civ-row-tag">
                    {t('dialogs.civ.governments.leader', { name: orgById(g.leader_id) ?? '' })}
                  </span>
                )}
                {typeof g.treasury === 'number' && (
                  <span className="civ-row-tag">
                    {t('dialogs.civ.governments.treasury', { amount: formatNumber(g.treasury) })}
                  </span>
                )}
                {g.laws && g.laws.length > 0 && (
                  <div className="civ-row-laws">
                    {g.laws.map((l) => (
                      <span key={l} className="civ-chip">
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.religions.heading')}</h3>
            {religions.length === 0 && <div className="civ-empty">{t('dialogs.civ.religions.empty')}</div>}
            {religions.map((r) => {
              const lineageId = r.founder_lineage ?? r.lineage_id ?? ''
              const canEnterTemple = hasEnterableBuilding(world, TEMPLE_BUILDINGS, lineageId)
              return (
                <div key={r.id} className="civ-row">
                  <span className="civ-row-head">
                    {'\u{271D}\u{FE0F}'} {r.name}
                  </span>
                  <span className="civ-row-sub">{r.kind}</span>
                  <span className="civ-row-tag">
                    {t('dialogs.civ.religions.adherents', { count: formatNumber(r.adherents ?? 0) })}
                  </span>
                  <span className="civ-row-tag">
                    {t('dialogs.civ.religions.foundedBy', { lineage: lineageById(lineageId) })}
                  </span>
                  {canEnterTemple ? (
                    <button
                      className="civ-row-link"
                      onClick={() => {
                        useSceneStore.getState().enter({ kind: 'temple', religionId: r.id })
                        onClose()
                      }}
                    >
                      {t('dialogs.civ.religions.enterTemple')}
                    </button>
                  ) : (
                    <span className="civ-row-tag">{t('dialogs.civ.religions.templeUnavailable')}</span>
                  )}
                </div>
              )
            })}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.conflicts.heading')}</h3>
            {battles.length === 0 && <div className="civ-empty">{t('dialogs.civ.conflicts.empty')}</div>}
            {battles.map((b) => {
              const atk = b.attackers.map(lineageById).join(', ')
              const def = b.defenders.map(lineageById).join(', ')
              const outcomeLabel =
                b.outcome === 'AttackerVictory'
                  ? t('dialogs.civ.conflicts.won', { side: atk })
                  : b.outcome === 'DefenderVictory'
                    ? t('dialogs.civ.conflicts.won', { side: def })
                    : b.outcome === 'Stalemate'
                      ? t('dialogs.civ.conflicts.stalemate')
                      : null
              return (
                <div key={b.id} className="civ-row">
                  <span className="civ-row-head">
                    {'\u{2694}\u{FE0F}'} {b.scale}
                  </span>
                  <span className="civ-row-sub">
                    {t('dialogs.civ.conflicts.versus', { attackers: atk, defenders: def })}
                  </span>
                  <span className="civ-row-tag">
                    {'\u{1F480}'} {formatNumber(b.casualties_a + b.casualties_d)}
                  </span>
                  <span className="civ-row-tag">
                    {b.ended
                      ? (outcomeLabel ?? t('dialogs.civ.conflicts.ended'))
                      : t('dialogs.civ.conflicts.ongoing')}
                  </span>
                </div>
              )
            })}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.diplomacy.heading')}</h3>
            {treaties.length === 0 && <div className="civ-empty">{t('dialogs.civ.diplomacy.empty')}</div>}
            {treaties.map((treaty, i) => (
              <div key={`${treaty.a_lineage}-${treaty.b_lineage}-${i}`} className="civ-row">
                <span className="civ-row-head">
                  {'\u{1F91D}'}{' '}
                  {t('dialogs.civ.diplomacy.pair', {
                    a: lineageById(treaty.a_lineage),
                    b: lineageById(treaty.b_lineage),
                  })}
                </span>
                <span className="civ-row-tag">
                  {(treaty.kind ?? t('dialogs.civ.diplomacy.treaty')).replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.buildings.heading')}</h3>
            {buildingRows.length === 0 && <div className="civ-empty">{t('dialogs.civ.buildings.empty')}</div>}
            <div className="civ-build-grid">
              {buildingRows.map(([kind, count]) => (
                <span key={kind} className="civ-chip">
                  {kind}: {formatNumber(count)}
                </span>
              ))}
              {buildingOverflow > 0 && (
                <span className="civ-chip">
                  {t('dialogs.civ.common.more', { count: formatNumber(buildingOverflow) })}
                </span>
              )}
            </div>
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.settlements.heading')}</h3>
            {!world.settlements?.length ? (
              <div className="civ-empty">{t('dialogs.civ.settlements.empty')}</div>
            ) : (
              world.settlements.map((settlement) => (
                <div key={settlement.lineage_id} className="civ-row">
                  <span className="civ-row-head">
                    {settlement.tier >= 5 ? '🏙️' : settlement.tier >= 3 ? '🏘️' : '⛺'} {settlement.name}
                  </span>
                  <span className="civ-row-sub">{settlement.tier_name}</span>
                  <span className="civ-row-tag">
                    {t('dialogs.civ.common.people', { count: formatNumber(settlement.population) })}
                  </span>
                  <span className="civ-row-tag">
                    {t('dialogs.civ.settlements.completedBuildings', {
                      count: formatNumber(settlement.building_count),
                    })}
                  </span>
                  {settlement.capacity > 0 && (
                    <span className="civ-row-tag">
                      {t('dialogs.civ.settlements.capacity', { count: formatNumber(settlement.capacity) })}
                    </span>
                  )}
                </div>
              ))
            )}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.agriculture.heading')}</h3>
            {!world.farms?.length ? (
              <div className="civ-empty">{t('dialogs.civ.agriculture.empty')}</div>
            ) : (
              <>
                <div className="civ-build-grid">
                  <span className="civ-chip">
                    🌱{' '}
                    {t('dialogs.civ.agriculture.growing', {
                      count: formatNumber(farmSummary.stages.growing),
                    })}
                  </span>
                  <span className="civ-chip">
                    🌾{' '}
                    {t('dialogs.civ.agriculture.harvestReady', {
                      count: formatNumber(farmSummary.stages.mature),
                    })}
                  </span>
                  <span className="civ-chip">
                    🟫{' '}
                    {t('dialogs.civ.agriculture.fallow', { count: formatNumber(farmSummary.stages.fallow) })}
                  </span>
                  {farmSummary.projectedYield > 0 && (
                    <span className="civ-chip">
                      {t('dialogs.civ.agriculture.projectedFood', {
                        count: formatNumber(farmSummary.projectedYield),
                      })}
                    </span>
                  )}
                </div>
                {farmSummary.crops.length > 0 && (
                  <div className="civ-build-grid" style={{ marginTop: 8 }}>
                    {farmSummary.crops.map(([crop, count]) => (
                      <span key={crop} className="civ-chip">
                        {t('dialogs.civ.agriculture.fields', { crop, count })}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.goods.heading')}</h3>
            {goodsTotalRows.length === 0 && <div className="civ-empty">{t('dialogs.civ.goods.empty')}</div>}
            <div className="civ-build-grid">
              {goodsTotalRows.map(([kind, total]) => (
                <span key={kind} className="civ-chip" title={kind.replace(/_/g, ' ')}>
                  {GOOD_EMOJI[kind] ?? '🧰'} {kind.replace(/_/g, ' ')}: {formatNumber(total)}
                </span>
              ))}
              {goodsOverflow > 0 && (
                <span className="civ-chip">
                  {t('dialogs.civ.common.more', { count: formatNumber(goodsOverflow) })}
                </span>
              )}
            </div>
            {goodsTotalRows.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                {t('dialogs.civ.goods.byLineage')}
                <div style={{ marginTop: 4 }}>
                  {[...goodsByLineage.entries()]
                    .sort((a, b) => {
                      const sa = [...a[1].values()].reduce((s, v) => s + v, 0)
                      const sb = [...b[1].values()].reduce((s, v) => s + v, 0)
                      return sb - sa
                    })
                    .slice(0, 6)
                    .map(([lid, bag]) => {
                      const lname = lineageById(lid)
                      const total = [...bag.values()].reduce((s, v) => s + v, 0)
                      const top = [...bag.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([k, n]) => `${GOOD_EMOJI[k] ?? ''}${n}`)
                        .join(' ')
                      return (
                        <div key={lid} className="civ-row" style={{ padding: '2px 0' }}>
                          <span className="civ-row-head">{lname}</span>
                          <span className="civ-row-tag">
                            {t('dialogs.civ.goods.held', { count: formatNumber(total) })}
                          </span>
                          <span className="civ-row-sub">{top}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.books.heading')}</h3>
            {books.length === 0 && <div className="civ-empty">{t('dialogs.civ.books.empty')}</div>}
            {books.slice(0, 6).map((b) => (
              <div key={b.id} className="civ-row">
                <span className="civ-row-head">
                  {'\u{1F4D6}'} {b.title}
                </span>
                <span className="civ-row-sub">
                  {t('dialogs.civ.books.on', { author: b.author_name ?? '', topic: b.topic ?? '' })}
                </span>
                <span className="civ-row-tag">
                  {t('dialogs.civ.books.copies', { count: formatNumber(b.copies ?? 0) })}
                </span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.artworks.heading')}</h3>
            {artworks.length === 0 && <div className="civ-empty">{t('dialogs.civ.artworks.empty')}</div>}
            {artworks.slice(0, 6).map((a) => (
              <div key={a.id} className="civ-row">
                <span className="civ-row-head">
                  {ART_EMOJI[a.kind] ?? ''} {a.title}
                </span>
                <span className="civ-row-sub">{t('dialogs.civ.artworks.by', { name: a.creator_name })}</span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.trade.heading')}</h3>
            {tradeRoutes.length === 0 && caravans.length === 0 ? (
              <div className="civ-empty">{t('dialogs.civ.trade.empty')}</div>
            ) : (
              <>
                <div className="civ-row">
                  <span className="civ-row-head">
                    {'\u{1F6E4}\u{FE0F}'} {t('dialogs.civ.trade.routes', { count: tradeRoutes.length })}
                  </span>
                  <span className="civ-row-tag">
                    {t('dialogs.civ.trade.caravans', { count: caravans.length })}
                  </span>
                  <span className="civ-row-sub">
                    {t('dialogs.civ.trade.totals', {
                      deliveries: formatNumber(tradeRoutes.reduce((sum, route) => sum + route.deliveries, 0)),
                      volume: formatNumber(tradeRoutes.reduce((sum, route) => sum + route.volume, 0)),
                    })}
                  </span>
                </div>
                {[...tradeRoutes]
                  .sort(
                    (left, right) =>
                      right.deliveries - left.deliveries ||
                      right.last_dispatch_tick - left.last_dispatch_tick ||
                      left.id - right.id,
                  )
                  .slice(0, 8)
                  .map((route) => {
                    const routeCaravans = caravans.filter((caravan) => caravan.route_id === route.id)
                    const distance =
                      Math.abs(route.a_center[0] - route.b_center[0]) +
                      Math.abs(route.a_center[1] - route.b_center[1])
                    return (
                      <div key={route.id} className="civ-row">
                        <span className="civ-row-head">
                          {lineageById(route.lineage_a)} ↔ {lineageById(route.lineage_b)}
                        </span>
                        <span className="civ-row-sub">
                          {t('dialogs.civ.trade.routeStats', {
                            distance: formatNumber(distance),
                            delivered: formatNumber(route.deliveries),
                            volume: formatNumber(route.volume),
                          })}
                        </span>
                        {routeCaravans.length > 0 && (
                          <span className="civ-row-tag">
                            {t('dialogs.civ.trade.enRoute', { count: formatNumber(routeCaravans.length) })}
                          </span>
                        )}
                      </div>
                    )
                  })}
                {[...caravans]
                  .sort((left, right) => left.arrives_tick - right.arrives_tick || left.id - right.id)
                  .slice(0, 8)
                  .map((caravan) => {
                    const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
                    const progress = Math.max(0, Math.min(1, (world.tick - caravan.departed_tick) / duration))
                    const eta = Math.max(0, caravan.arrives_tick - world.tick)
                    return (
                      <div key={caravan.id} className="civ-row">
                        <span className="civ-row-head">
                          {'\u{1F42A}'} {lineageById(caravan.sender_lineage)} →{' '}
                          {lineageById(caravan.receiver_lineage)}
                        </span>
                        <span className="civ-row-sub">
                          {GOOD_EMOJI[caravan.cargo] ?? '\u{1F4E6}'} {formatNumber(caravan.amount)}{' '}
                          {caravan.cargo.replace(/_/g, ' ')} · {formatNumber(Math.round(progress * 100))}%
                        </span>
                        <span className="civ-row-tag">
                          {eta === 0
                            ? t('dialogs.civ.trade.readyToUnload')
                            : t('dialogs.civ.trade.ticksAway', { ticks: formatNumber(eta) })}
                        </span>
                      </div>
                    )
                  })}
              </>
            )}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.tradeLog.heading')}</h3>
            {(() => {
              const trades = world.trades ?? []
              if (trades.length === 0) {
                return <div className="civ-empty">{t('dialogs.civ.tradeLog.empty')}</div>
              }
              const nameById = new Map<string, string>()
              for (const o of world.organisms) nameById.set(o.id, o.name)
              return trades.slice(0, 6).map((trade, i) => {
                const buyer = nameById.get(trade.buyer_id) ?? trade.buyer_id.slice(0, 6)
                const seller = nameById.get(trade.seller_id) ?? trade.seller_id.slice(0, 6)
                return (
                  <div key={`${trade.tick}-${i}`} className="civ-row">
                    <span className="civ-row-head">
                      {'\u{1F4B0}'} {seller} → {buyer}
                    </span>
                    <span className="civ-row-sub">
                      {GOOD_EMOJI[trade.good] ?? ''} {formatNumber(trade.amount)}{' '}
                      {trade.good.replace(/_/g, ' ')}
                    </span>
                    <span className="civ-row-tag">
                      {t('dialogs.civ.tradeLog.coins', { count: trade.price })}
                    </span>
                    <span className="civ-row-tag">
                      {t('dialogs.civ.common.tick', { tick: formatNumber(trade.tick) })}
                    </span>
                  </div>
                )
              })
            })()}
          </section>

          <section className="civ-section">
            <h3>{t('dialogs.civ.headlines.heading')}</h3>
            {headlines.length === 0 && <div className="civ-empty">{t('dialogs.civ.headlines.empty')}</div>}
            {headlines.slice(0, 12).map((h, i) => (
              <div key={`${h.tick}-${i}`} className="civ-headline">
                <span className="civ-headline-tick">
                  {t('dialogs.civ.common.tick', { tick: formatNumber(h.tick) })}
                </span>
                <span className="civ-headline-text">{h.text}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </Modal>
  )
}
