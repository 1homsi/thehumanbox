import { useMemo, useState } from 'react'
import type { WorldState } from '../types'
import type { LineageStrategy } from '../simulation/sandbox'
import { Modal } from './Modal'
import { normalizeLineageEras } from '../utils/lineageEras'
import { useSceneStore } from '../stores/scene'
import { farmStage } from '../world/farms'
import { getBuildingState } from '../world/building-state'

interface Props {
  world: WorldState
  onClose: () => void
  onGuide?: (lineageId: string, strategy: LineageStrategy) => Promise<boolean>
  onCancelGuide?: (lineageId: string) => Promise<boolean>
}

const GUIDANCE: Array<{
  value: LineageStrategy
  label: string
  description: string
  reward: string
}> = [
  {
    value: 'hunt',
    label: 'secure food',
    description: 'focus hunters on tracking, trapping, and bringing food home',
    reward: 'food reserves for every living member',
  },
  {
    value: 'explore',
    label: 'explore',
    description: 'push into unknown terrain and act on new discoveries',
    reward: 'trail maps and a curiosity surge',
  },
  {
    value: 'settle',
    label: 'settle & build',
    description: 'gather materials, rest safely, and expand the settlement',
    reward: 'communal wood and stone reserves',
  },
  {
    value: 'trade',
    label: 'trade',
    description: 'seek exchanges, markets, and foreign trade partners',
    reward: 'shared wealth for the lineage',
  },
  {
    value: 'defend',
    label: 'defend',
    description: 'sound alarms, fortify territory, and protect vulnerable kin',
    reward: 'restored health, courage, and morale',
  },
]

const CAMPAIGN_READINESS_REASON: Record<string, string> = {
  lineage_not_living: 'lineage has ended',
  no_capable_hunter: 'needs a hunter old enough to fight',
  no_living_prey: 'no living prey remains',
  no_mobile_explorer: 'needs a mobile explorer',
  no_adult_worker: 'needs an adult worker',
  no_capable_trader: 'needs an adult or elder trader',
  no_foreign_lineage: 'needs another living lineage',
  no_capable_defender: 'needs a defender old enough to fight',
  unknown_strategy: 'unavailable',
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

export function CivStatsModal({ world, onClose, onGuide, onCancelGuide }: Props) {
  const [guidanceBusy, setGuidanceBusy] = useState<Record<string, boolean>>({})
  const [guidanceResult, setGuidanceResult] = useState<Record<string, string>>({})
  const [cancelConfirming, setCancelConfirming] = useState<Record<string, boolean>>({})
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
  const guideLineage = (lineageId: string, strategy: LineageStrategy) => {
    if (!onGuide || guidanceBusy[lineageId]) return
    const active = activeStrategyFor(lineageId)
    if (
      active &&
      !active.completed &&
      active.strategy !== strategy &&
      !window.confirm(
        `Redirect ${lineageById(lineageId)} from ${active.strategy} to ${strategy}? Current progress will be archived.`,
      )
    ) {
      return
    }

    setGuidanceBusy((current) => ({ ...current, [lineageId]: true }))
    setGuidanceResult((current) => ({ ...current, [lineageId]: 'guiding…' }))
    void onGuide(lineageId, strategy)
      .then((ok) => {
        setGuidanceResult((current) => ({
          ...current,
          [lineageId]: ok ? `${strategy} campaign started` : 'guidance rejected',
        }))
      })
      .catch(() => {
        setGuidanceResult((current) => ({ ...current, [lineageId]: 'guidance unavailable' }))
      })
      .finally(() => {
        setGuidanceBusy((current) => ({ ...current, [lineageId]: false }))
      })
  }
  const cancelGuidance = (lineageId: string) => {
    if (!onCancelGuide || guidanceBusy[lineageId]) return
    const active = activeStrategyFor(lineageId)
    if (!active) return

    setGuidanceBusy((current) => ({ ...current, [lineageId]: true }))
    setGuidanceResult((current) => ({ ...current, [lineageId]: 'standing down…' }))
    void onCancelGuide(lineageId)
      .then((ok) => {
        if (ok) {
          setCancelConfirming((current) => ({ ...current, [lineageId]: false }))
        }
        setGuidanceResult((current) => ({
          ...current,
          [lineageId]: ok ? 'campaign stood down' : 'stand-down rejected',
        }))
      })
      .catch(() => {
        setGuidanceResult((current) => ({ ...current, [lineageId]: 'guidance unavailable' }))
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
    <Modal open onClose={onClose} className="civ-modal" title={'\u{1F30D} Civilization'}>
      {world.cosmos && (
        <div className="civ-calendar">
          <div className="civ-cal-item">
            <span className="civ-cal-label">year</span>
            <span className="civ-cal-value">{world.cosmos.year}</span>
            <span className="civ-cal-sub">day {world.cosmos.day_of_year} of 84</span>
          </div>
          <span className="civ-cal-sep" aria-hidden="true" />
          <div className="civ-cal-item">
            <span className="civ-cal-moon">{moonGlyphs[world.cosmos.moon_phase] ?? '🌑'}</span>
            <span className="civ-cal-value">{world.cosmos.moon_phase.replace(/_/g, ' ')}</span>
            <span className="civ-cal-sub">{Math.round(world.cosmos.moon_illum * 100)}% lit</span>
          </div>
          <span className="civ-cal-sep" aria-hidden="true" />
          <div className="civ-cal-item">
            <span className="civ-cal-label">season</span>
            <span className="civ-cal-value">{world.season}</span>
          </div>
          {world.current_era && (
            <>
              <span className="civ-cal-sep" aria-hidden="true" />
              <div className="civ-cal-item">
                <span className="civ-cal-label">world tech</span>
                <span className="civ-cal-value">{world.current_era}</span>
              </div>
            </>
          )}
        </div>
      )}
      <div className="civ-modal-grid">
        <div className="civ-cols">
          <section className="civ-section civ-section--span">
            <h3>Lineages</h3>
            <div className="civ-table-wrap">
              <table className="civ-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Lineage Era</th>
                    <th>Pop</th>
                    <th>Next</th>
                    <th>Gov</th>
                    <th>Currency</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
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
                    const hasBrewing = world.organisms.some(
                      (o) => o.alive && o.lineage_id === l.id && o.discoveries.includes('brewing'),
                    )
                    const canEnterTavern = hasEnterableBuilding(world, TAVERN_BUILDINGS, l.id)
                    return (
                      <tr key={l.id}>
                        <td>{lineageById(l.id)}</td>
                        <td>
                          {ERA_EMOJI[era] ?? ''} {era}
                        </td>
                        <td>{l.count}</td>
                        <td>
                          {progress?.next_era ? (
                            <div className="civ-era-progress">
                              <span className={progress.ready ? 'civ-era-ready' : 'civ-era-next'}>
                                {progress.next_era}
                              </span>
                              {!worldPopulationReady && (
                                <span className="civ-era-gate">
                                  world population {worldPopulation}/{worldPopulationRequired}
                                </span>
                              )}
                              {progress.missing.length > 0 && (
                                <span className="civ-era-missing">
                                  missing {progress.missing.slice(0, 3).join(', ')}
                                  {progress.missing.length > 3 ? ' +' : ''}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="civ-era-next">-</span>
                          )}
                        </td>
                        <td>{gov ? `${GOV_EMOJI[gov.kind] ?? ''} ${gov.kind}` : '-'}</td>
                        <td>{currencies[l.id] ?? '-'}</td>
                        <td>
                          <div className="civ-lineage-actions">
                            {activeStrategy && (
                              <span
                                className={
                                  activeStrategy.completed
                                    ? 'civ-strategy-active civ-strategy-complete'
                                    : 'civ-strategy-active'
                                }
                              >
                                {activeStrategy.strategy} {objectivePercent}%
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
                                🍻 tavern
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
                  <span className="civ-campaign-board-kicker">Player guidance</span>
                  <h4>Lineage campaigns</h4>
                </div>
                <span className="civ-campaign-board-help">
                  Lineages still choose their own actions. Goals scale with population, and 75% effort
                  salvages a reduced reward.
                </span>
              </div>
              <div className="civ-campaign-cards">
                {lineages.map((lineage) => {
                  const active = activeStrategyFor(lineage.id)
                  const campaignOptions = world.lineage_campaign_options?.[lineage.id] ?? {}
                  const readyCampaignCount = GUIDANCE.filter(
                    (strategy) => campaignOptions[strategy.value]?.available !== false,
                  ).length
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
                          <span className="civ-campaign-pop">{lineage.count} people</span>
                        </div>
                        {active ? (
                          <span className="civ-campaign-badge">
                            {active.completed ? 'completed' : (meta?.label ?? active.strategy)}
                          </span>
                        ) : (
                          <span className="civ-campaign-badge idle">awaiting guidance</span>
                        )}
                      </div>

                      {active ? (
                        <>
                          <p className="civ-campaign-description">
                            {meta?.description ?? `focus on ${active.strategy}`}
                          </p>
                          <div className="civ-campaign-progress-copy">
                            <span>
                              {progress}/{target} collective effort
                            </span>
                            <span>{active.completed ? 'reward earned' : `${remaining} ticks left`}</span>
                          </div>
                          <span
                            className="civ-campaign-card-progress"
                            role="progressbar"
                            aria-label={`${lineageById(lineage.id)} ${active.strategy} campaign`}
                            aria-valuemin={0}
                            aria-valuemax={target}
                            aria-valuenow={Math.min(progress, target)}
                          >
                            <span style={{ width: `${percent}%` }} />
                          </span>
                          <span className="civ-campaign-reward">
                            Reward: {meta?.reward ?? 'lineage morale'}
                          </span>
                        </>
                      ) : (
                        <p className="civ-campaign-description">
                          {readyCampaignCount}/{GUIDANCE.length} campaigns are viable now. Unavailable choices
                          explain what the lineage still needs.
                        </p>
                      )}

                      <div className="civ-campaign-card-actions">
                        {onGuide && (
                          <select
                            className="civ-guide-select"
                            aria-label={`Guide ${lineageById(lineage.id)}`}
                            value=""
                            disabled={Boolean(guidanceBusy[lineage.id])}
                            onChange={(event) => {
                              const strategy = event.target.value as LineageStrategy
                              if (strategy) guideLineage(lineage.id, strategy)
                            }}
                          >
                            <option value="">{active ? 'change campaign…' : 'start campaign…'}</option>
                            {GUIDANCE.map((strategy) => {
                              const readiness = campaignOptions[strategy.value]
                              const reason = readiness?.reason
                                ? (CAMPAIGN_READINESS_REASON[readiness.reason] ?? readiness.reason)
                                : null
                              return (
                                <option
                                  key={strategy.value}
                                  value={strategy.value}
                                  disabled={readiness?.available === false}
                                >
                                  {strategy.label}
                                  {reason ? ` — ${reason}` : ''}
                                </option>
                              )
                            })}
                          </select>
                        )}
                        {active &&
                          onCancelGuide &&
                          (cancelConfirming[lineage.id] ? (
                            <span className="civ-campaign-cancel-confirm">
                              <button
                                type="button"
                                className="civ-campaign-cancel"
                                disabled={Boolean(guidanceBusy[lineage.id])}
                                onClick={() => cancelGuidance(lineage.id)}
                              >
                                confirm stand down
                              </button>
                              <button
                                type="button"
                                className="civ-campaign-keep"
                                disabled={Boolean(guidanceBusy[lineage.id])}
                                onClick={() =>
                                  setCancelConfirming((current) => ({
                                    ...current,
                                    [lineage.id]: false,
                                  }))
                                }
                              >
                                keep
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="civ-campaign-cancel"
                              disabled={Boolean(guidanceBusy[lineage.id])}
                              onClick={() =>
                                setCancelConfirming((current) => ({
                                  ...current,
                                  [lineage.id]: true,
                                }))
                              }
                            >
                              stand down
                            </button>
                          ))}
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
                  <span className="civ-campaign-history-title">Recent campaigns</span>
                  {campaignHistory.length > 6 && (
                    <button
                      type="button"
                      className="civ-campaign-history-toggle"
                      onClick={() => setShowAllCampaigns((current) => !current)}
                    >
                      {showAllCampaigns ? 'show recent' : `show all ${campaignHistory.length}`}
                    </button>
                  )}
                </div>
                <div className="civ-campaign-history-list">
                  {(showAllCampaigns ? campaignHistory : campaignHistory.slice(0, 6)).map((campaign) => {
                    const icon =
                      campaign.outcome === 'completed'
                        ? '✓'
                        : campaign.outcome === 'partial'
                          ? '≈'
                          : campaign.outcome === 'redirected'
                            ? '↪'
                            : campaign.outcome === 'cancelled'
                              ? '■'
                              : '×'
                    return (
                      <div
                        key={`${campaign.lineage_id}:${campaign.started_tick}:${campaign.ended_tick}:${campaign.strategy}:${campaign.outcome}`}
                        className={`civ-campaign-record civ-campaign-record--${campaign.outcome}`}
                      >
                        <span className="civ-campaign-outcome" aria-hidden="true">
                          {icon}
                        </span>
                        <span className="civ-campaign-name">
                          {campaign.lineage_name || lineageById(campaign.lineage_id)} · {campaign.strategy}
                        </span>
                        <span className="civ-campaign-result">
                          {campaign.reason === 'lineage_extinct'
                            ? 'lineage ended'
                            : campaign.reason === 'player_cancelled'
                              ? 'stood down'
                              : campaign.outcome}
                        </span>
                        <span className="civ-campaign-effort">
                          {campaign.progress}/{campaign.target}
                        </span>
                        <span className="civ-campaign-tick">t{campaign.ended_tick}</span>
                        {campaign.impact && <span className="civ-campaign-impact">{campaign.impact}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="civ-section">
            <h3>Governments &amp; Leaders</h3>
            {governments.length === 0 && <div className="civ-empty">No governments yet</div>}
            {governments.map((g) => (
              <div key={g.lineage_id} className="civ-row">
                <span className="civ-row-head">
                  {GOV_EMOJI[g.kind] ?? ''} {g.kind}
                </span>
                <span className="civ-row-sub">{lineageById(g.lineage_id)}</span>
                {g.leader_id && <span className="civ-row-tag">leader: {orgById(g.leader_id)}</span>}
                {typeof g.treasury === 'number' && (
                  <span className="civ-row-tag">treasury: {g.treasury}</span>
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
            <h3>Religions</h3>
            {religions.length === 0 && <div className="civ-empty">No religions founded yet</div>}
            {religions.map((r) => {
              const lineageId = r.founder_lineage ?? r.lineage_id ?? ''
              const canEnterTemple = hasEnterableBuilding(world, TEMPLE_BUILDINGS, lineageId)
              return (
                <div key={r.id} className="civ-row">
                  <span className="civ-row-head">
                    {'\u{271D}\u{FE0F}'} {r.name}
                  </span>
                  <span className="civ-row-sub">{r.kind}</span>
                  <span className="civ-row-tag">{r.adherents} adherents</span>
                  <span className="civ-row-tag">founded by {lineageById(lineageId)}</span>
                  {canEnterTemple ? (
                    <button
                      className="civ-row-link"
                      onClick={() => {
                        useSceneStore.getState().enter({ kind: 'temple', religionId: r.id })
                        onClose()
                      }}
                    >
                      enter temple →
                    </button>
                  ) : (
                    <span className="civ-row-tag">temple unavailable</span>
                  )}
                </div>
              )
            })}
          </section>

          <section className="civ-section">
            <h3>Conflicts</h3>
            {battles.length === 0 && <div className="civ-empty">No battles yet</div>}
            {battles.map((b) => {
              const atk = b.attackers.map(lineageById).join(', ')
              const def = b.defenders.map(lineageById).join(', ')
              const outcomeLabel =
                b.outcome === 'AttackerVictory'
                  ? `${atk} won`
                  : b.outcome === 'DefenderVictory'
                    ? `${def} won`
                    : b.outcome === 'Stalemate'
                      ? 'stalemate'
                      : null
              return (
                <div key={b.id} className="civ-row">
                  <span className="civ-row-head">
                    {'\u{2694}\u{FE0F}'} {b.scale}
                  </span>
                  <span className="civ-row-sub">
                    {atk} vs {def}
                  </span>
                  <span className="civ-row-tag">
                    {'\u{1F480}'} {b.casualties_a + b.casualties_d}
                  </span>
                  <span className="civ-row-tag">{b.ended ? (outcomeLabel ?? 'ended') : 'ongoing'}</span>
                </div>
              )
            })}
          </section>

          <section className="civ-section">
            <h3>Diplomacy</h3>
            {treaties.length === 0 && <div className="civ-empty">No treaties yet</div>}
            {treaties.map((t, i) => (
              <div key={`${t.a_lineage}-${t.b_lineage}-${i}`} className="civ-row">
                <span className="civ-row-head">
                  {'\u{1F91D}'} {lineageById(t.a_lineage)} &amp; {lineageById(t.b_lineage)}
                </span>
                <span className="civ-row-tag">{(t.kind ?? 'treaty').replace(/_/g, ' ')}</span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>Buildings</h3>
            {buildingRows.length === 0 && <div className="civ-empty">Nothing built yet</div>}
            <div className="civ-build-grid">
              {buildingRows.map(([kind, count]) => (
                <span key={kind} className="civ-chip">
                  {kind}: {count}
                </span>
              ))}
              {buildingOverflow > 0 && <span className="civ-chip">+{buildingOverflow} more</span>}
            </div>
          </section>

          <section className="civ-section">
            <h3>Settlements</h3>
            {!world.settlements?.length ? (
              <div className="civ-empty">No stable settlements yet</div>
            ) : (
              world.settlements.map((settlement) => (
                <div key={settlement.lineage_id} className="civ-row">
                  <span className="civ-row-head">
                    {settlement.tier >= 5 ? '🏙️' : settlement.tier >= 3 ? '🏘️' : '⛺'} {settlement.name}
                  </span>
                  <span className="civ-row-sub">{settlement.tier_name}</span>
                  <span className="civ-row-tag">{settlement.population} people</span>
                  <span className="civ-row-tag">{settlement.building_count} completed buildings</span>
                  {settlement.capacity > 0 && (
                    <span className="civ-row-tag">capacity {settlement.capacity}</span>
                  )}
                </div>
              ))
            )}
          </section>

          <section className="civ-section">
            <h3>Agriculture</h3>
            {!world.farms?.length ? (
              <div className="civ-empty">No fields have been plowed yet</div>
            ) : (
              <>
                <div className="civ-build-grid">
                  <span className="civ-chip">🌱 growing: {farmSummary.stages.growing}</span>
                  <span className="civ-chip">🌾 harvest ready: {farmSummary.stages.mature}</span>
                  <span className="civ-chip">🟫 fallow: {farmSummary.stages.fallow}</span>
                  {farmSummary.projectedYield > 0 && (
                    <span className="civ-chip">projected food: {farmSummary.projectedYield}</span>
                  )}
                </div>
                {farmSummary.crops.length > 0 && (
                  <div className="civ-build-grid" style={{ marginTop: 8 }}>
                    {farmSummary.crops.map(([crop, count]) => (
                      <span key={crop} className="civ-chip">
                        {crop}: {count} {count === 1 ? 'field' : 'fields'}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="civ-section">
            <h3>Goods in Circulation</h3>
            {goodsTotalRows.length === 0 && <div className="civ-empty">No crafted goods held yet</div>}
            <div className="civ-build-grid">
              {goodsTotalRows.map(([kind, total]) => (
                <span key={kind} className="civ-chip" title={kind.replace(/_/g, ' ')}>
                  {GOOD_EMOJI[kind] ?? '🧰'} {kind.replace(/_/g, ' ')}: {total}
                </span>
              ))}
              {goodsOverflow > 0 && <span className="civ-chip">+{goodsOverflow} more</span>}
            </div>
            {goodsTotalRows.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                by lineage:
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
                          <span className="civ-row-tag">{total} held</span>
                          <span className="civ-row-sub">{top}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </section>

          <section className="civ-section">
            <h3>Recent Books</h3>
            {books.length === 0 && <div className="civ-empty">No books written yet</div>}
            {books.slice(0, 6).map((b) => (
              <div key={b.id} className="civ-row">
                <span className="civ-row-head">
                  {'\u{1F4D6}'} {b.title}
                </span>
                <span className="civ-row-sub">
                  {b.author_name} on {b.topic}
                </span>
                <span className="civ-row-tag">{b.copies} copies</span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>Artworks</h3>
            {artworks.length === 0 && <div className="civ-empty">Nothing made yet</div>}
            {artworks.slice(0, 6).map((a) => (
              <div key={a.id} className="civ-row">
                <span className="civ-row-head">
                  {ART_EMOJI[a.kind] ?? ''} {a.title}
                </span>
                <span className="civ-row-sub">by {a.creator_name}</span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>Trade Network</h3>
            {tradeRoutes.length === 0 && caravans.length === 0 ? (
              <div className="civ-empty">
                No routes yet — Iron-era merchants need two established settlements, currency, navigation, and
                a trade workspace.
              </div>
            ) : (
              <>
                <div className="civ-row">
                  <span className="civ-row-head">
                    {'\u{1F6E4}\u{FE0F}'} {tradeRoutes.length} route{tradeRoutes.length === 1 ? '' : 's'}
                  </span>
                  <span className="civ-row-tag">
                    {caravans.length} caravan{caravans.length === 1 ? '' : 's'} traveling
                  </span>
                  <span className="civ-row-sub">
                    {tradeRoutes.reduce((sum, route) => sum + route.deliveries, 0)} deliveries ·{' '}
                    {tradeRoutes.reduce((sum, route) => sum + route.volume, 0)} goods moved
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
                          {distance} tiles · {route.deliveries} delivered · {route.volume} volume
                        </span>
                        {routeCaravans.length > 0 && (
                          <span className="civ-row-tag">{routeCaravans.length} en route</span>
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
                          {GOOD_EMOJI[caravan.cargo] ?? '\u{1F4E6}'} {caravan.amount}{' '}
                          {caravan.cargo.replace(/_/g, ' ')} · {Math.round(progress * 100)}%
                        </span>
                        <span className="civ-row-tag">
                          {eta === 0 ? 'ready to unload' : `${eta} ticks away`}
                        </span>
                      </div>
                    )
                  })}
              </>
            )}
          </section>

          <section className="civ-section">
            <h3>Recent Trades</h3>
            {(() => {
              const trades = world.trades ?? []
              if (trades.length === 0) {
                return <div className="civ-empty">No trades yet (needs barter / currency)</div>
              }
              const nameById = new Map<string, string>()
              for (const o of world.organisms) nameById.set(o.id, o.name)
              return trades.slice(0, 6).map((t, i) => {
                const buyer = nameById.get(t.buyer_id) ?? t.buyer_id.slice(0, 6)
                const seller = nameById.get(t.seller_id) ?? t.seller_id.slice(0, 6)
                return (
                  <div key={`${t.tick}-${i}`} className="civ-row">
                    <span className="civ-row-head">
                      {'\u{1F4B0}'} {seller} → {buyer}
                    </span>
                    <span className="civ-row-sub">
                      {GOOD_EMOJI[t.good] ?? ''} {t.amount} {t.good.replace(/_/g, ' ')}
                    </span>
                    <span className="civ-row-tag">
                      {t.price} coin{t.price === 1 ? '' : 's'}
                    </span>
                    <span className="civ-row-tag">tick {t.tick}</span>
                  </div>
                )
              })
            })()}
          </section>

          <section className="civ-section">
            <h3>Headlines</h3>
            {headlines.length === 0 && <div className="civ-empty">No notable events yet</div>}
            {headlines.slice(0, 12).map((h, i) => (
              <div key={`${h.tick}-${i}`} className="civ-headline">
                <span className="civ-headline-tick">tick {h.tick}</span>
                <span className="civ-headline-text">{h.text}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </Modal>
  )
}
