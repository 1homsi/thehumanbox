import { useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import clsx from 'clsx'
import { useSimulation } from './useSimulation'
import { useUIStore } from './store'
import { WorldView } from './WorldView'
import { OrgCard } from './components/OrgCard'
import { OrgDetail } from './components/OrgDetail'
import { EventRow } from './components/EventRow'
import { Modal } from './components/Modal'
import { Tooltip } from './components/Tooltip'

const LanguageModal      = lazy(() => import('./components/LanguageModal').then(m => ({ default: m.LanguageModal })))
const ChroniclesModal    = lazy(() => import('./components/ChroniclesModal').then(m => ({ default: m.ChroniclesModal })))
const FamilyTreeModal    = lazy(() => import('./components/FamilyTreeModal').then(m => ({ default: m.FamilyTreeModal })))
const OrgSearchModal     = lazy(() => import('./components/OrgSearchModal').then(m => ({ default: m.OrgSearchModal })))
const StatsModal         = lazy(() => import('./components/StatsModal').then(m => ({ default: m.StatsModal })))
const ConversationsModal = lazy(() => import('./components/ConversationsModal').then(m => ({ default: m.ConversationsModal })))
const AboutModal         = lazy(() => import('./components/AboutModal').then(m => ({ default: m.AboutModal })))
import type { OrganismState } from './types'
import {
  lineageColor, lineageWord, HIDDEN_EVENT_TYPES,
} from './constants'
import './App.css'

const TILE_FIRE = 4

function App() {
  const { world, connected, interp } = useSimulation()

  // ── UI state from zustand (no more prop drilling) ───────────────────────
  const selectedOrgId   = useUIStore(s => s.selectedOrgId)
  const followOrgId     = useUIStore(s => s.followOrgId)
  const showLanguages   = useUIStore(s => s.showLanguages)
  const showChronicles  = useUIStore(s => s.showChronicles)
  const showFamilyTree  = useUIStore(s => s.showFamilyTree)
  const showOrgSearch   = useUIStore(s => s.showOrgSearch)
  const showStats       = useUIStore(s => s.showStats)
  const showAllLineages = useUIStore(s => s.showAllLineages)
  const showAbout       = useUIStore(s => s.showAbout)
  const convoOrgId      = useUIStore(s => s.convoOrgId)
  const panelOpen       = useUIStore(s => s.panelOpen)
  const leftOpen        = useUIStore(s => s.leftOpen)
  const overlay         = useUIStore(s => s.overlay)
  const focus           = useUIStore(s => s.focus)
  const viewFlags       = useUIStore(s => s.viewFlags)
  const showMore        = useUIStore(s => s.showMore)
  const isFullscreen    = useUIStore(s => s.isFullscreen)

  // Stable action selectors - these never trigger re-renders
  const selectOrg        = useUIStore(s => s.selectOrg)
  const followOrg        = useUIStore(s => s.followOrg)
  const openLanguages    = useUIStore(s => s.openLanguages)
  const closeLanguages   = useUIStore(s => s.closeLanguages)
  const openChronicles   = useUIStore(s => s.openChronicles)
  const closeChronicles  = useUIStore(s => s.closeChronicles)
  const openFamilyTree   = useUIStore(s => s.openFamilyTree)
  const closeFamilyTree  = useUIStore(s => s.closeFamilyTree)
  const openOrgSearch    = useUIStore(s => s.openOrgSearch)
  const closeOrgSearch   = useUIStore(s => s.closeOrgSearch)
  const openStats        = useUIStore(s => s.openStats)
  const closeStats       = useUIStore(s => s.closeStats)
  const openAllLineages  = useUIStore(s => s.openAllLineages)
  const closeAllLineages = useUIStore(s => s.closeAllLineages)
  const openAbout        = useUIStore(s => s.openAbout)
  const closeAbout       = useUIStore(s => s.closeAbout)
  const openConvo        = useUIStore(s => s.openConvo)
  const closeConvo       = useUIStore(s => s.closeConvo)
  const togglePanel      = useUIStore(s => s.togglePanel)
  const toggleLeft       = useUIStore(s => s.toggleLeft)
  const toggleMore       = useUIStore(s => s.toggleMore)
  const setOverlay       = useUIStore(s => s.setOverlay)
  const setFocus         = useUIStore(s => s.setFocus)
  const setViewFlag      = useUIStore(s => s.setViewFlag)
  const setFullscreen    = useUIStore(s => s.setFullscreen)

  const moreRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {})
    }
  }, [setFullscreen])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [setFullscreen])

  const splashHiddenRef = useRef(false)
  useEffect(() => {
    if (world && !splashHiddenRef.current) {
      splashHiddenRef.current = true
      window.dispatchEvent(new Event('thb-world-ready'))
    }
  }, [world])

  useEffect(() => {
    if (!showMore) return
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        useUIStore.setState({ showMore: false })
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMore])

  // Keep selected org in sync with live world data
  const selectedOrg = selectedOrgId
    ? world?.organisms.find(o => o.id === selectedOrgId) ?? null
    : null

  // All expensive per-render computations memoized - only recompute when world changes
  const fireTiles = useMemo(() =>
    world ? world.grid.tiles.reduce((n, row) => n + row.filter(t => t === TILE_FIRE).length, 0) : 0
  , [world])

  const sickOrgs = useMemo(() =>
    world ? world.organisms.filter(o => o.alive && o.infection > 0.15).length : 0
  , [world])

  const liveOrgs = useMemo(() => world ? world.organisms.filter(o =>  o.alive) : [], [world])
  const deadOrgs = useMemo(() => world ? world.organisms.filter(o => !o.alive) : [], [world])

  // Group alive organisms by lineage
  const lineages = useMemo(() => {
    const result: Record<string, { count: number; minGen: number; maxGen: number; orgs: OrganismState[] }> = {}
    if (!world) return result
    for (const org of liveOrgs) {
      if (!result[org.lineage_id]) {
        result[org.lineage_id] = { count: 0, minGen: org.generation, maxGen: org.generation, orgs: [] }
      }
      result[org.lineage_id].count++
      result[org.lineage_id].orgs.push(org)
      result[org.lineage_id].minGen = Math.min(result[org.lineage_id].minGen, org.generation)
      result[org.lineage_id].maxGen = Math.max(result[org.lineage_id].maxGen, org.generation)
    }
    return result
  }, [world, liveOrgs])

  // Helper: resolve a tribe name from lineage_id, falling back to first-6-chars of id
  const tribeName = (lid: string) =>
    world?.lineage_names?.[lid] ?? (lid ?? '').slice(0, 6)

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>The Human Box</h1>
          <a className="github-link" href="https://github.com/stackxio/thehumanbox" target="_blank" rel="noreferrer">
            <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.111.82-.261.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </a>
          <span className={clsx('status', connected && world ? 'online' : 'offline')}>
            <span className="status-dot" />
            {connected && world ? 'LIVE' : 'connecting...'}
          </span>
          {world && <Tooltip tip={`Simulation tick ${world.tick.toLocaleString()} - 600 ticks = 1 in-world day · ${Math.floor(world.tick / 600)} days elapsed`}><span className="tick" style={{ cursor: 'default' }}>tick {world.tick.toLocaleString()}</span></Tooltip>}
        </div>
        <div className="header-badges">
          {world && (
            <Tooltip tip={world.is_day ? 'Daytime - organisms are active and foraging' : 'Nighttime - energy drain slows, less activity'}>
              <span className="daynight">{world.is_day ? '☀️ day' : '🌙 night'}</span>
            </Tooltip>
          )}
          {world && (
            <Tooltip tip="Current season - affects food growth rate, drought risk, and organism energy drain">
              <span className={clsx('season-badge', `season-${world.season}`)}>{world.season}</span>
            </Tooltip>
          )}
          {world?.current_era && world.current_era !== 'genesis' && world.current_era !== 'equilibrium' && (
            <Tooltip tip={`World era: ${world.current_era} - shapes resource availability and organism behaviour`}>
              <span className={clsx('era-badge', `era-${world.current_era}`)}>{world.current_era}</span>
            </Tooltip>
          )}
          {world?.drought && (
            <Tooltip tip="Drought active - water tiles shrinking, dehydration deaths rising">
              <span className="drought-badge">drought</span>
            </Tooltip>
          )}
          {world?.weather?.kind === 'rain' && (
            <Tooltip tip="Rain - accelerating drought recovery, replenishing dry soil">
              <span className="weather-badge rain">🌧 rain</span>
            </Tooltip>
          )}
          {world?.weather?.kind === 'storm' && (
            <Tooltip tip="Storm - draining organism energy, lightning strikes possible">
              <span className="weather-badge storm">⛈ storm</span>
            </Tooltip>
          )}
          {fireTiles > 0 && (
            <Tooltip tip={`${fireTiles} tile${fireTiles > 1 ? 's' : ''} on fire - spreading to nearby flammable terrain`}>
              <span className="fire-badge">🔥 {fireTiles}</span>
            </Tooltip>
          )}
          {sickOrgs > 0 && (
            <Tooltip tip={`${sickOrgs} organism${sickOrgs > 1 ? 's' : ''} infected - sickness spreads through close contact`}>
              <span className="sick-badge">🤒 {sickOrgs}</span>
            </Tooltip>
          )}
        </div>
        {world && (
          <div className="header-actions">
            <Tooltip tip="Population graphs, birth and death rates, lineage growth over time">
              <button className="lang-btn" onClick={openStats}>▦ stats</button>
            </Tooltip>
            <Tooltip tip="Search and filter all organisms - alive or dead - by name, thought, lineage, or discovery">
              <button className="lang-btn" onClick={openOrgSearch}>⌕ search</button>
            </Tooltip>
            <Tooltip tip="Stories generated from world events - the history of this civilisation as it unfolds">
              <button className="lang-btn" onClick={openChronicles}>
                ✦ chronicles{world.story_history?.length > 0 ? ` (${world.story_history.length})` : ''}
              </button>
            </Tooltip>
            <div className="more-menu" ref={moreRef}>
              <button className={clsx('lang-btn', showMore && 'active')} onClick={toggleMore}>··· more</button>
              {showMore && (
                <div className="more-dropdown">

                  <div className="more-dropdown-section">overlays</div>
                  <div className="more-dropdown-grid">
                    <button className={clsx('lang-btn', overlay === 'density' && 'active')} onClick={() => setOverlay(overlay === 'density' ? null : 'density')} title="Population density">👥 crowd</button>
                  </div>

                  <div className="more-dropdown-divider" />
                  <div className="more-dropdown-section">focus</div>
                  <div className="more-dropdown-grid">
                    <button className={clsx('lang-btn', focus === 'all'      && 'active')} onClick={() => setFocus('all')}>· all</button>
                    <button className={clsx('lang-btn', focus === 'sick'     && 'active')} onClick={() => setFocus(focus === 'sick' ? 'all' : 'sick')} title="Highlight sick organisms">🤒 sick</button>
                    <button className={clsx('lang-btn', focus === 'hungry'   && 'active')} onClick={() => setFocus(focus === 'hungry' ? 'all' : 'hungry')} title="Highlight starving organisms">😫 hungry</button>
                    <button className={clsx('lang-btn', focus === 'elders'   && 'active')} onClick={() => setFocus(focus === 'elders' ? 'all' : 'elders')} title="Highlight elders">👴 elders</button>
                    <button className={clsx('lang-btn', focus === 'builders' && 'active')} onClick={() => setFocus(focus === 'builders' ? 'all' : 'builders')} title="Highlight builders">🏗 builders</button>
                    <button className={clsx('lang-btn', focus === 'thriving' && 'active')} onClick={() => setFocus(focus === 'thriving' ? 'all' : 'thriving')} title="Highlight thriving organisms">✦ thriving</button>
                  </div>

                  <div className="more-dropdown-divider" />
                  <div className="more-dropdown-section">view</div>
                  <div className="more-dropdown-grid">
                    <button className={clsx('lang-btn', viewFlags.territory && 'active')} onClick={() => setViewFlag('territory', !viewFlags.territory)}>⬡ territory</button>
                    <button className={clsx('lang-btn', viewFlags.names     && 'active')} onClick={() => setViewFlag('names',     !viewFlags.names)}>Aa names</button>
                    <button className={clsx('lang-btn', viewFlags.thoughts  && 'active')} onClick={() => setViewFlag('thoughts',  !viewFlags.thoughts)}>💭 thoughts</button>
                    <button className={clsx('lang-btn', viewFlags.animals   && 'active')} onClick={() => setViewFlag('animals',   !viewFlags.animals)}>🦌 animals</button>
                    <button className={clsx('lang-btn', viewFlags.grid      && 'active')} onClick={() => setViewFlag('grid',      !viewFlags.grid)}>⊞ grid</button>
                  </div>

                  <div className="more-dropdown-divider" />
                  <div className="more-dropdown-grid">
                    <button className="lang-btn" onClick={() => { openLanguages();   useUIStore.setState({ showMore: false }) }}>⌖ lang</button>
                    <button className="lang-btn" onClick={() => { openFamilyTree();  useUIStore.setState({ showMore: false }) }}>⬡ tree</button>
                    <button className={clsx('lang-btn', leftOpen && 'active')} onClick={() => { toggleLeft(); useUIStore.setState({ showMore: false }) }}>⊞ world</button>
                    <button className="lang-btn" onClick={() => { openAbout(); useUIStore.setState({ showMore: false }) }} title="Build info, versions, and links">ⓘ about</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {world && (
          <button className="panel-toggle-btn" onClick={togglePanel}>
            {panelOpen ? '✕' : '≡'} panel
          </button>
        )}
        {world && (
          <button className="fullscreen-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            {isFullscreen
              ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 1H1v3M8 1h3v3M4 11H1V8M8 11h3V8"/><path d="M4 4l-2 2 2 2M8 4l2 2-2 2" strokeWidth="1"/></svg>
              : <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4V1h3M8 1h3v3M1 8v3h3M8 11h3V8"/></svg>
            }
          </button>
        )}
      </header>

      <main className="main">
        {world ? (
          <div className="layout">

            {/* ── Left panel: world state ──────────────────────────── */}
            <aside className={clsx('panel', 'panel-left', leftOpen && 'open')}>
              <div className="section-title">WORLD HISTORY</div>
              <div className="history-grid">
                <Tooltip tip="Total organisms ever born into this world"><span className="hist-label" style={{ cursor: 'default' }}>births</span></Tooltip>      <span className="hist-val">{world.history.births}</span>
                <Tooltip tip="Deaths from old age - organisms that lived a full life"><span className="hist-label" style={{ cursor: 'default' }}>old age</span></Tooltip>     <span className="hist-val">{world.history.deaths_old_age}</span>
                <Tooltip tip="Deaths from starvation or dehydration - not enough food or water"><span className="hist-label" style={{ cursor: 'default' }}>starvation</span></Tooltip>  <span className="hist-val">{world.history.deaths_starvation}</span>
                <Tooltip tip="Deaths from disease - infection spread between organisms"><span className="hist-label" style={{ cursor: 'default' }}>sickness</span></Tooltip>    <span className="hist-val">{world.history.deaths_sickness}</span>
                <Tooltip tip="Deaths from combat - organisms killed in territorial or resource disputes"><span className="hist-label" style={{ cursor: 'default' }}>combat</span></Tooltip>      <span className="hist-val">{world.history.deaths_combat}</span>
                <Tooltip tip="Lineage alliances formed - mutual cooperation agreements between tribes"><span className="hist-label" style={{ cursor: 'default' }}>alliances</span></Tooltip>   <span className="hist-val">{world.history.alliances_formed}</span>
                <Tooltip tip="Total territorial challenges issued - one organism confronting another"><span className="hist-label" style={{ cursor: 'default' }}>challenges</span></Tooltip>  <span className="hist-val">{world.history.challenges_total}</span>
                <Tooltip tip="Food gifted between organisms - social bonding and kin support behaviour"><span className="hist-label" style={{ cursor: 'default' }}>gifts</span></Tooltip>       <span className="hist-val">{world.history.gifts_total}</span>
                <Tooltip tip="Drought events - periods of water scarcity that forced migration and die-offs"><span className="hist-label" style={{ cursor: 'default' }}>droughts</span></Tooltip>    <span className="hist-val">{world.history.droughts}</span>
                <Tooltip tip="Disease outbreaks - epidemic events that swept through the population"><span className="hist-label" style={{ cursor: 'default' }}>outbreaks</span></Tooltip>   <span className="hist-val">{world.history.outbreaks}</span>
              </div>

              <div className="section-title">LINEAGES ({Object.keys(lineages).length})</div>
              <div className="lineage-list">
                {Object.entries(lineages)
                  .sort((a, b) => b[1].count - a[1].count)
                  .slice(0, 5)
                  .map(([lid, info]) => (
                    <div key={lid} className="lineage-row">
                      <span className="lineage-dot" style={{ background: lineageColor(lid) }} />
                      <span className="lineage-id">{tribeName(lid)}</span>
                      <span className="lineage-count">{info.count}</span>
                      <span className="lineage-gen">
                        g{info.minGen}{info.maxGen > info.minGen ? `–${info.maxGen}` : ''}
                      </span>
                      <span className="lineage-strat">
                        {lineageWord(info.orgs, 'home') || lineageWord(info.orgs, 'food') || ''}
                      </span>
                    </div>
                  ))}
                {Object.keys(lineages).length > 5 && (
                  <button className="view-all-btn" onClick={openAllLineages}>
                    view all ({Object.keys(lineages).length})
                  </button>
                )}
              </div>

              <div className="section-title">EVENTS</div>
              <div className="event-log">
                {[...world.events].reverse()
                  .filter(e => !HIDDEN_EVENT_TYPES.has(e.type))
                  .slice(0, 20)
                  .map((e, i) => <EventRow key={i} event={e} />)}
              </div>
            </aside>

            {/* ── World canvas ─────────────────────────────────────── */}
            <WorldView
              world={world}
              interp={interp}
            />

            {/* ── Right panel: organisms ───────────────────────────── */}
            {panelOpen && (
              <div className="panel-overlay" onClick={togglePanel} />
            )}
            <aside className={clsx('panel', 'panel-right', panelOpen && 'open')}>
              {selectedOrg && (
                <OrgDetail
                  org={selectedOrg}
                  onClose={() => selectOrg(null)}
                  onFollow={followOrg}
                  following={followOrgId === selectedOrg.id}
                  lineageNames={world?.lineage_names}
                  organisms={world?.organisms}
                />
              )}

              <div className="section-title">ALIVE ({liveOrgs.length})</div>
              {liveOrgs.map(org => (
                <OrgCard
                  key={org.id}
                  org={org}
                  sexWords={world?.sex_words}
                  onTrack={() => followOrg(org.id)}
                  onConvos={org.conversation_count ? () => openConvo(org.id) : undefined}
                  lineageNames={world?.lineage_names}
                  organisms={world?.organisms}
                />
              ))}

              {deadOrgs.length > 0 && (
                <>
                  <div className="section-title">DEAD ({deadOrgs.length})</div>
                  {deadOrgs.slice(-5).map(org => (
                    <div key={org.id} className="org-card dead">
                      <div className="org-header">
                        <span className="org-name">{org.name}</span>
                        <span className="org-meta">g{org.generation} · {org.age}</span>
                      </div>
                      <div className="org-thought">
                        {org.thought ?? '-'}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </aside>

          </div>
        ) : (
          <div className="waiting">waiting for simulation...</div>
        )}
      </main>
      <Suspense fallback={null}>
        {showLanguages && world && (
          <LanguageModal
            organisms={world.organisms.filter(o => o.alive)}
            sexWords={world.sex_words}
            onClose={closeLanguages}
            lineageNames={world.lineage_names}
          />
        )}
        {showChronicles && world && (
          <ChroniclesModal
            stories={world.story_history ?? []}
            onClose={closeChronicles}
          />
        )}
        {showFamilyTree && world && (
          <FamilyTreeModal
            organisms={world.organisms}
            currentTick={world.tick}
            sexWords={world.sex_words}
            onClose={closeFamilyTree}
          />
        )}
        {showOrgSearch && world && (
          <OrgSearchModal
            organisms={world.organisms}
            onTrack={(id) => { followOrg(id); closeOrgSearch() }}
            onClose={closeOrgSearch}
            lineageNames={world.lineage_names}
          />
        )}
        {convoOrgId && world && (() => {
          const org = world.organisms.find(o => o.id === convoOrgId)
          return org ? (
            <ConversationsModal
              org={org}
              allOrgs={world.organisms}
              sexWords={world.sex_words}
              onClose={closeConvo}
            />
          ) : null
        })()}
        {showStats && world && (
          <StatsModal
            world={world}
            onClose={closeStats}
          />
        )}
        {showAbout && (
          <AboutModal onClose={closeAbout} />
        )}
      </Suspense>
      {showAllLineages && world && (
        <Modal open onClose={closeAllLineages} className="lang-modal" title="All lineages" hideTitle>
          <div className="lang-modal-header">
            <span className="lang-modal-title">ALL LINEAGES ({Object.keys(lineages).length})</span>
            <button className="close-btn" onClick={closeAllLineages}>✕</button>
          </div>
          <div className="lang-modal-body">
            <div className="lineage-list">
              {Object.entries(lineages)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([lid, info]) => (
                  <div key={lid} className="lineage-row">
                    <span className="lineage-dot" style={{ background: lineageColor(lid) }} />
                    <span className="lineage-id">{tribeName(lid)}</span>
                    <span className="lineage-count">{info.count}</span>
                    <span className="lineage-gen">
                      g{info.minGen}{info.maxGen > info.minGen ? `–${info.maxGen}` : ''}
                    </span>
                    <span className="lineage-strat">
                      {lineageWord(info.orgs, 'home') || lineageWord(info.orgs, 'food') || ''}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default App
