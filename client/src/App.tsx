import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSimulation } from './useSimulation'
import { WorldView } from './WorldView'
import { OrgCard } from './components/OrgCard'
import { OrgDetail } from './components/OrgDetail'
import { EventRow } from './components/EventRow'
import { LanguageModal } from './components/LanguageModal'
import { ChroniclesModal } from './components/ChroniclesModal'
import { FamilyTreeModal } from './components/FamilyTreeModal'
import { OrgSearchModal } from './components/OrgSearchModal'
import { StatsModal } from './components/StatsModal'
import { ConversationsModal } from './components/ConversationsModal'
import { Tooltip } from './components/Tooltip'
import type { OrganismState } from './types'
import {
  lineageColor, lineageWord, HIDDEN_EVENT_TYPES,
} from './constants'
import './App.css'

const TILE_FIRE = 4

function App() {
  const { world, connected } = useSimulation()
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [followOrgId, setFollowOrgId]     = useState<string | null>(null)
  const [showLanguages,  setShowLanguages]  = useState(false)
  const [showChronicles, setShowChronicles] = useState(false)
  const [showFamilyTree, setShowFamilyTree] = useState(false)
  const [showOrgSearch,  setShowOrgSearch]  = useState(false)
  const [showStats,      setShowStats]      = useState(false)
  const [convoOrgId,     setConvoOrgId]     = useState<string | null>(null)
  const [panelOpen,      setPanelOpen]      = useState(false)
  const [leftOpen,       setLeftOpen]       = useState(true)
  const [overlay,        setOverlay]        = useState<string | null>(null)
  const [showMore,          setShowMore]          = useState(false)
  const [showAllLineages,   setShowAllLineages]   = useState(false)
  const [isFullscreen,   setIsFullscreen]   = useState(false)
  const [focus,          setFocus]          = useState<string>('all')
  const [viewFlags,      setViewFlags]      = useState({
    territory: false, names: true, thoughts: true, animals: true, grid: false,
  })
  const moreRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  useEffect(() => {
    if (!showMore) return
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMore])

  // Keep selected org in sync with live world data
  const selectedOrg = selectedOrgId
    ? world?.organisms.find(o => o.id === selectedOrgId) ?? null
    : null

  const handleOrgSelect = useCallback((id: string | null) => {
    setSelectedOrgId(id)
    if (!id) setFollowOrgId(null)
  }, [])

  const handleFollow = useCallback((id: string | null) => {
    setFollowOrgId(id)
  }, [])

  // All expensive per-render computations memoized — only recompute when world changes
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
    world?.lineage_names?.[lid] ?? lid.slice(0, 6)

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
          <span className={`status ${connected && world ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            {connected && world ? 'LIVE' : 'connecting...'}
          </span>
          {world && <Tooltip tip={`Simulation tick ${world.tick.toLocaleString()} — 600 ticks = 1 in-world day · ${Math.floor(world.tick / 600)} days elapsed`}><span className="tick" style={{ cursor: 'default' }}>tick {world.tick.toLocaleString()}</span></Tooltip>}
        </div>
        <div className="header-badges">
          {world && (
            <Tooltip tip={world.is_day ? 'Daytime — organisms are active and foraging' : 'Nighttime — energy drain slows, less activity'}>
              <span className="daynight">{world.is_day ? '☀️ day' : '🌙 night'}</span>
            </Tooltip>
          )}
          {world && (
            <Tooltip tip="Current season — affects food growth rate, drought risk, and organism energy drain">
              <span className={`season-badge season-${world.season}`}>{world.season}</span>
            </Tooltip>
          )}
          {world?.current_era && world.current_era !== 'genesis' && world.current_era !== 'equilibrium' && (
            <Tooltip tip={`World era: ${world.current_era} — shapes resource availability and organism behaviour`}>
              <span className={`era-badge era-${world.current_era}`}>{world.current_era}</span>
            </Tooltip>
          )}
          {world?.drought && (
            <Tooltip tip="Drought active — water tiles shrinking, dehydration deaths rising">
              <span className="drought-badge">drought</span>
            </Tooltip>
          )}
          {world?.weather?.kind === 'rain' && (
            <Tooltip tip="Rain — accelerating drought recovery, replenishing dry soil">
              <span className="weather-badge rain">🌧 rain</span>
            </Tooltip>
          )}
          {world?.weather?.kind === 'storm' && (
            <Tooltip tip="Storm — draining organism energy, lightning strikes possible">
              <span className="weather-badge storm">⛈ storm</span>
            </Tooltip>
          )}
          {fireTiles > 0 && (
            <Tooltip tip={`${fireTiles} tile${fireTiles > 1 ? 's' : ''} on fire — spreading to nearby flammable terrain`}>
              <span className="fire-badge">🔥 {fireTiles}</span>
            </Tooltip>
          )}
          {sickOrgs > 0 && (
            <Tooltip tip={`${sickOrgs} organism${sickOrgs > 1 ? 's' : ''} infected — sickness spreads through close contact`}>
              <span className="sick-badge">🤒 {sickOrgs}</span>
            </Tooltip>
          )}
        </div>
        {world && (
          <div className="header-actions">
            <Tooltip tip="Population graphs, birth and death rates, lineage growth over time">
              <button className="lang-btn" onClick={() => setShowStats(true)}>▦ stats</button>
            </Tooltip>
            <Tooltip tip="Search and filter all organisms — alive or dead — by name, thought, lineage, or discovery">
              <button className="lang-btn" onClick={() => setShowOrgSearch(true)}>⌕ search</button>
            </Tooltip>
            <Tooltip tip="Stories generated from world events — the history of this civilisation as it unfolds">
              <button className="lang-btn" onClick={() => setShowChronicles(true)}>
                ✦ chronicles{world.story_history?.length > 0 ? ` (${world.story_history.length})` : ''}
              </button>
            </Tooltip>
            <div className="more-menu" ref={moreRef}>
              <button className={`lang-btn${showMore ? ' active' : ''}`} onClick={() => setShowMore(p => !p)}>··· more</button>
              {showMore && (
                <div className="more-dropdown">

                  <div className="more-dropdown-section">overlays</div>
                  <div className="more-dropdown-grid">
                    <button className={`lang-btn${overlay === 'density' ? ' active' : ''}`} onClick={() => setOverlay(o => o === 'density' ? null : 'density')} title="Population density">👥 crowd</button>
                  </div>

                  <div className="more-dropdown-divider" />
                  <div className="more-dropdown-section">focus</div>
                  <div className="more-dropdown-grid">
                    <button className={`lang-btn${focus === 'all' ? ' active' : ''}`} onClick={() => setFocus('all')}>· all</button>
                    <button className={`lang-btn${focus === 'sick' ? ' active' : ''}`} onClick={() => setFocus(f => f === 'sick' ? 'all' : 'sick')} title="Highlight sick organisms">🤒 sick</button>
                    <button className={`lang-btn${focus === 'hungry' ? ' active' : ''}`} onClick={() => setFocus(f => f === 'hungry' ? 'all' : 'hungry')} title="Highlight starving organisms">😫 hungry</button>
                    <button className={`lang-btn${focus === 'elders' ? ' active' : ''}`} onClick={() => setFocus(f => f === 'elders' ? 'all' : 'elders')} title="Highlight elders">👴 elders</button>
                    <button className={`lang-btn${focus === 'builders' ? ' active' : ''}`} onClick={() => setFocus(f => f === 'builders' ? 'all' : 'builders')} title="Highlight builders">🏗 builders</button>
                    <button className={`lang-btn${focus === 'thriving' ? ' active' : ''}`} onClick={() => setFocus(f => f === 'thriving' ? 'all' : 'thriving')} title="Highlight thriving organisms">✦ thriving</button>
                  </div>

                  <div className="more-dropdown-divider" />
                  <div className="more-dropdown-section">view</div>
                  <div className="more-dropdown-grid">
                    <button className={`lang-btn${viewFlags.territory ? ' active' : ''}`} onClick={() => setViewFlags(v => ({ ...v, territory: !v.territory }))}>⬡ territory</button>
                    <button className={`lang-btn${viewFlags.names ? ' active' : ''}`} onClick={() => setViewFlags(v => ({ ...v, names: !v.names }))}>Aa names</button>
                    <button className={`lang-btn${viewFlags.thoughts ? ' active' : ''}`} onClick={() => setViewFlags(v => ({ ...v, thoughts: !v.thoughts }))}>💭 thoughts</button>
                    <button className={`lang-btn${viewFlags.animals ? ' active' : ''}`} onClick={() => setViewFlags(v => ({ ...v, animals: !v.animals }))}>🦌 animals</button>
                    <button className={`lang-btn${viewFlags.grid ? ' active' : ''}`} onClick={() => setViewFlags(v => ({ ...v, grid: !v.grid }))}>⊞ grid</button>
                  </div>

                  <div className="more-dropdown-divider" />
                  <div className="more-dropdown-grid">
                    <button className="lang-btn" onClick={() => { setShowLanguages(true); setShowMore(false) }}>⌖ lang</button>
                    <button className="lang-btn" onClick={() => { setShowFamilyTree(true); setShowMore(false) }}>⬡ tree</button>
                    <button className={`lang-btn${leftOpen ? ' active' : ''}`} onClick={() => { setLeftOpen(p => !p); setShowMore(false) }}>⊞ world</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {world && (
          <button className="panel-toggle-btn" onClick={() => setPanelOpen(p => !p)}>
            {panelOpen ? '✕' : '≡'} panel
          </button>
        )}
        <button className="fullscreen-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
          {isFullscreen
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 1H1v3M8 1h3v3M4 11H1V8M8 11h3V8"/><path d="M4 4l-2 2 2 2M8 4l2 2-2 2" strokeWidth="1"/></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4V1h3M8 1h3v3M1 8v3h3M8 11h3V8"/></svg>
          }
        </button>
      </header>

      <main className="main">
        {world ? (
          <div className="layout">

            {/* ── Left panel: world state ──────────────────────────── */}
            <aside className={`panel panel-left${leftOpen ? ' open' : ''}`}>
              <div className="section-title">WORLD HISTORY</div>
              <div className="history-grid">
                <Tooltip tip="Total organisms ever born into this world"><span className="hist-label" style={{ cursor: 'default' }}>births</span></Tooltip>      <span className="hist-val">{world.history.births}</span>
                <Tooltip tip="Deaths from old age — organisms that lived a full life"><span className="hist-label" style={{ cursor: 'default' }}>old age</span></Tooltip>     <span className="hist-val">{world.history.deaths_old_age}</span>
                <Tooltip tip="Deaths from starvation or dehydration — not enough food or water"><span className="hist-label" style={{ cursor: 'default' }}>starvation</span></Tooltip>  <span className="hist-val">{world.history.deaths_starvation}</span>
                <Tooltip tip="Deaths from disease — infection spread between organisms"><span className="hist-label" style={{ cursor: 'default' }}>sickness</span></Tooltip>    <span className="hist-val">{world.history.deaths_sickness}</span>
                <Tooltip tip="Deaths from combat — organisms killed in territorial or resource disputes"><span className="hist-label" style={{ cursor: 'default' }}>combat</span></Tooltip>      <span className="hist-val">{world.history.deaths_combat}</span>
                <Tooltip tip="Lineage alliances formed — mutual cooperation agreements between tribes"><span className="hist-label" style={{ cursor: 'default' }}>alliances</span></Tooltip>   <span className="hist-val">{world.history.alliances_formed}</span>
                <Tooltip tip="Total territorial challenges issued — one organism confronting another"><span className="hist-label" style={{ cursor: 'default' }}>challenges</span></Tooltip>  <span className="hist-val">{world.history.challenges_total}</span>
                <Tooltip tip="Food gifted between organisms — social bonding and kin support behaviour"><span className="hist-label" style={{ cursor: 'default' }}>gifts</span></Tooltip>       <span className="hist-val">{world.history.gifts_total}</span>
                <Tooltip tip="Drought events — periods of water scarcity that forced migration and die-offs"><span className="hist-label" style={{ cursor: 'default' }}>droughts</span></Tooltip>    <span className="hist-val">{world.history.droughts}</span>
                <Tooltip tip="Disease outbreaks — epidemic events that swept through the population"><span className="hist-label" style={{ cursor: 'default' }}>outbreaks</span></Tooltip>   <span className="hist-val">{world.history.outbreaks}</span>
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
                  <button className="view-all-btn" onClick={() => setShowAllLineages(true)}>
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
              selectedOrgId={selectedOrgId}
              followOrgId={followOrgId}
              onOrgSelect={handleOrgSelect}
              overlay={overlay}
              focus={focus}
              viewFlags={viewFlags}
            />

            {/* ── Right panel: organisms ───────────────────────────── */}
            {panelOpen && (
              <div className="panel-overlay" onClick={() => setPanelOpen(false)} />
            )}
            <aside className={`panel panel-right${panelOpen ? ' open' : ''}`}>
              {selectedOrg && (
                <OrgDetail
                  org={selectedOrg}
                  onClose={() => handleOrgSelect(null)}
                  onFollow={handleFollow}
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
                  onTrack={() => handleFollow(org.id)}
                  onConvos={org.conversation_count ? () => setConvoOrgId(org.id) : undefined}
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
                        {org.thought ?? '—'}
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
      {showLanguages && world && (
        <LanguageModal
          organisms={world.organisms.filter(o => o.alive)}
          sexWords={world.sex_words}
          onClose={() => setShowLanguages(false)}
          lineageNames={world.lineage_names}
        />
      )}
      {showChronicles && world && (
        <ChroniclesModal
          stories={world.story_history ?? []}
          onClose={() => setShowChronicles(false)}
        />
      )}
      {showFamilyTree && world && (
        <FamilyTreeModal
          organisms={world.organisms}
          currentTick={world.tick}
          sexWords={world.sex_words}
          onClose={() => setShowFamilyTree(false)}
        />
      )}
      {showOrgSearch && world && (
        <OrgSearchModal
          organisms={world.organisms}
          onTrack={(id) => { handleFollow(id); setShowOrgSearch(false) }}
          onClose={() => setShowOrgSearch(false)}
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
            onClose={() => setConvoOrgId(null)}
          />
        ) : null
      })()}
      {showStats && world && (
        <StatsModal
          world={world}
          onClose={() => setShowStats(false)}
        />
      )}
      {showAllLineages && world && (
        <div className="lang-modal-backdrop" onClick={() => setShowAllLineages(false)}>
          <div className="lang-modal" onClick={e => e.stopPropagation()} style={{ width: 400 }}>
            <div className="lang-modal-header">
              <span className="lang-modal-title">ALL LINEAGES ({Object.keys(lineages).length})</span>
              <button className="close-btn" onClick={() => setShowAllLineages(false)}>✕</button>
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
          </div>
        </div>
      )}
    </div>
  )
}

export default App
