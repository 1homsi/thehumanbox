import type { WorldState } from '../types'
import { useFrozenSnapshot } from '../useFrozenSnapshot'
import { Modal } from './Modal'
import { DAY_LENGTH, kindIcon } from './stats/constants'
import { PopChart } from './stats/PopChart'
import { RelationsTable } from './stats/RelationsTable'
import { DiscoveryTimeline } from './stats/DiscoveryTimeline'
import { AgePyramid } from './stats/AgePyramid'
import { TraitAverages } from './stats/TraitAverages'
import { DiscoveryRollup } from './stats/DiscoveryRollup'
import { BondStats } from './stats/BondStats'
import { NotableOrgs } from './stats/NotableOrgs'

interface Props {
  world: WorldState
  onClose: () => void
}

export function StatsModal({ world: liveWorld, onClose }: Props) {
  // Snapshot at open time so the panel doesn't churn on every WS tick.
  // The reload icon swaps in the current world.
  const { frozen: world, reload } = useFrozenSnapshot(() => liveWorld)
  const liveCount  = world.organisms.filter(o => o.alive).length
  const totalDeaths = (world.history.deaths_old_age ?? 0)
    + (world.history.deaths_starvation ?? 0)
    + (world.history.deaths_dehydration ?? 0)
    + (world.history.deaths_sickness ?? 0)
    + (world.history.deaths_combat ?? 0)
  const fireCount    = world.organisms.filter(o => o.alive && (o.discoveries ?? []).includes('fire')).length
  const shelterCount = world.organisms.filter(o => o.alive && (o.discoveries ?? []).includes('shelter')).length
  const currentDay   = Math.floor(world.tick / DAY_LENGTH)

  const animalCount  = world.animals.length
  const animalKinds  = world.animals.reduce<Record<string, number>>((acc, a) => {
    acc[a.kind] = (acc[a.kind] ?? 0) + 1
    return acc
  }, {})

  return (
    <Modal open onClose={onClose} className="stats-modal" title="Stats" hideTitle>
        <div className="lang-modal-header">
          <span className="lang-modal-title">STATS</span>
          <span className="tree-modal-sub">day {currentDay} · {liveCount} alive</span>
          <div className="modal-header-actions">
            <button className="reload-btn" onClick={reload} title="Reload from current world">⟳</button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="stats-body">

          <div className="stats-quick">
            <div className="stats-num-card">
              <div className="stats-num">{liveCount}</div>
              <div className="stats-num-label">alive</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{totalDeaths}</div>
              <div className="stats-num-label">total deaths</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{world.history.births}</div>
              <div className="stats-num-label">total births</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{currentDay}</div>
              <div className="stats-num-label">days elapsed</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{fireCount}</div>
              <div className="stats-num-label">🔥 know fire</div>
            </div>
            <div className="stats-num-card">
              <div className="stats-num">{shelterCount}</div>
              <div className="stats-num-label">🏠 have shelter</div>
            </div>
            <div
              className="stats-num-card stats-num-card-wide"
              title={Object.entries(animalKinds).sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${kindIcon(k)} ${k}: ${n}`).join('\n')}
            >
              <div className="stats-num">{animalCount}</div>
              <div className="stats-num-label">🦌 animals</div>
              <div className="stats-num-sub">
                {Object.entries(animalKinds).sort((a, b) => b[1] - a[1]).slice(0, 3)
                  .map(([k, n]) => `${kindIcon(k)} ${n}`).join('  ')}
                {Object.keys(animalKinds).length > 3 && '  …'}
              </div>
            </div>
          </div>

          <div className="stats-section-title">POPULATION OVER TIME</div>
          <div className="stats-chart-wrap">
            <PopChart history={world.pop_history ?? []} />
          </div>

          <div className="stats-grid">
            <section>
              <div className="stats-section-title">AGE PYRAMID</div>
              <AgePyramid organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">POPULATION TRAITS</div>
              <TraitAverages organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">TRIBAL RELATIONS</div>
              <RelationsTable
                relations={world.tribal_relations ?? []}
                lineageSizes={world.lineage_sizes ?? []}
              />
            </section>

            <section>
              <div className="stats-section-title">DISCOVERY ROLLUP</div>
              <DiscoveryRollup organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">CAUSES OF DEATH</div>
              <div className="stats-death-grid">
                <span className="hist-label">starvation</span>  <span className="hist-val">{world.history.deaths_starvation}</span>
                <span className="hist-label">dehydration</span> <span className="hist-val">{world.history.deaths_dehydration}</span>
                <span className="hist-label">sickness</span>    <span className="hist-val">{world.history.deaths_sickness}</span>
                <span className="hist-label">combat</span>      <span className="hist-val">{world.history.deaths_combat}</span>
                <span className="hist-label">old age</span>     <span className="hist-val">{world.history.deaths_old_age}</span>
                <span className="hist-label">droughts</span>    <span className="hist-val">{world.history.droughts}</span>
                <span className="hist-label">outbreaks</span>   <span className="hist-val">{world.history.outbreaks}</span>
              </div>
            </section>

            <section>
              <div className="stats-section-title">BONDS &amp; FAMILY</div>
              <BondStats organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">NOTABLE ORGANISMS</div>
              <NotableOrgs organisms={world.organisms.filter(o => o.alive)} />
            </section>

            <section>
              <div className="stats-section-title">DISCOVERY LOG</div>
              <DiscoveryTimeline events={world.events ?? []} />
            </section>

            {world.history.era_history && world.history.era_history.length > 0 && (
              <section>
                <div className="stats-section-title">WORLD ERAS</div>
                <div className="stats-timeline">
                  {[...world.history.era_history].reverse().slice(0, 12).map((e, i) => (
                    <div key={i} className="stats-timeline-row">
                      <span className="stats-tick">d{Math.floor(e.tick / DAY_LENGTH)}</span>
                      <span className={`era-badge era-${e.era}`} style={{ fontSize: 9 }}>{e.era}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

        </div>
    </Modal>
  )
}
