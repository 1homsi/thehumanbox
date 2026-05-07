import { useState, useCallback, useRef, useEffect } from 'react'
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
  const [panelOpen,      setPanelOpen]      = useState(false)
  const [leftOpen,       setLeftOpen]       = useState(true)
  const [overlay,        setOverlay]        = useState<string | null>(null)
  const [showMore,       setShowMore]       = useState(false)
  const [isFullscreen,   setIsFullscreen]   = useState(false)
  const [focus,          setFocus]          = useState<string>('all')
  const [viewFlags,      setViewFlags]      = useState({
    territory: true, names: true, thoughts: true, animals: true, grid: false,
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

  const fireTiles = world ? world.grid.tiles.flat().filter(t => t === TILE_FIRE).length : 0
  const sickOrgs  = world ? world.organisms.filter(o => o.alive && o.infection > 0.15).length : 0

  // Group alive organisms by lineage
  const lineages: Record<string, { count: number; minGen: number; maxGen: number; orgs: OrganismState[] }> = {}
  if (world) {
    for (const org of world.organisms) {
      if (!org.alive) continue
      if (!lineages[org.lineage_id]) {
        lineages[org.lineage_id] = { count: 0, minGen: org.generation, maxGen: org.generation, orgs: [] }
      }
      lineages[org.lineage_id].count++
      lineages[org.lineage_id].orgs.push(org)
      lineages[org.lineage_id].minGen = Math.min(lineages[org.lineage_id].minGen, org.generation)
      lineages[org.lineage_id].maxGen = Math.max(lineages[org.lineage_id].maxGen, org.generation)
    }
  }

  const liveOrgs = world ? world.organisms.filter(o =>  o.alive) : []
  const deadOrgs = world ? world.organisms.filter(o => !o.alive) : []

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>The Human Box</h1>
          <a className="github-link" href="https://github.com/stackxio/thehumanbox" target="_blank" rel="noreferrer">GitHub</a>
          {!connected && <span className="status offline">○ connecting...</span>}
          {world && <span className="tick">tick {world.tick.toLocaleString()}</span>}
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
            <button className="lang-btn" onClick={() => setLeftOpen(p => !p)}>⊞ world</button>
            <button className="lang-btn" onClick={() => setShowStats(true)}>▦ stats</button>
            <button className="lang-btn" onClick={() => setShowOrgSearch(true)}>⌕ search</button>
            <button className="lang-btn" onClick={() => setShowChronicles(true)}>
              ✦ chronicles{world.story_history?.length > 0 ? ` (${world.story_history.length})` : ''}
            </button>
            <div className="more-menu" ref={moreRef}>
              <button className={`lang-btn${showMore ? ' active' : ''}`} onClick={() => setShowMore(p => !p)}>··· more</button>
              {showMore && (
                <div className="more-dropdown">

                  <div className="more-dropdown-section">overlays</div>
                  <div className="more-dropdown-grid">
                    <button className={`lang-btn${overlay === 'fertility' ? ' active' : ''}`} onClick={() => setOverlay(o => o === 'fertility' ? null : 'fertility')} title="Soil fertility">🌱 soil</button>
                    <button className={`lang-btn${overlay === 'hazard' ? ' active' : ''}`} onClick={() => setOverlay(o => o === 'hazard' ? null : 'hazard')} title="Hazard memory">☠ hazard</button>
                    <button className={`lang-btn${overlay === 'pressure' ? ' active' : ''}`} onClick={() => setOverlay(o => o === 'pressure' ? null : 'pressure')} title="Migration trails">👣 trails</button>
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
                <span className="hist-label">births</span>      <span className="hist-val">{world.history.births}</span>
                <span className="hist-label">old age</span>     <span className="hist-val">{world.history.deaths_old_age}</span>
                <span className="hist-label">starvation</span>  <span className="hist-val">{world.history.deaths_starvation}</span>
                <span className="hist-label">sickness</span>    <span className="hist-val">{world.history.deaths_sickness}</span>
                <span className="hist-label">combat</span>      <span className="hist-val">{world.history.deaths_combat}</span>
                <span className="hist-label">alliances</span>   <span className="hist-val">{world.history.alliances_formed}</span>
                <span className="hist-label">challenges</span>  <span className="hist-val">{world.history.challenges_total}</span>
                <span className="hist-label">gifts</span>       <span className="hist-val">{world.history.gifts_total}</span>
                <span className="hist-label">droughts</span>    <span className="hist-val">{world.history.droughts}</span>
                <span className="hist-label">outbreaks</span>   <span className="hist-val">{world.history.outbreaks}</span>
              </div>

              <div className="section-title">LINEAGES ({Object.keys(lineages).length})</div>
              <div className="lineage-list">
                {Object.entries(lineages)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([lid, info]) => (
                    <div key={lid} className="lineage-row">
                      <span className="lineage-dot" style={{ background: lineageColor(lid) }} />
                      <span className="lineage-id">{lid.slice(0, 6)}</span>
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
                />
              )}

              <div className="section-title">ALIVE ({liveOrgs.length})</div>
              {liveOrgs.map(org => <OrgCard key={org.id} org={org} />)}

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
                        {org.thought_history[org.thought_history.length - 1]?.text ?? '—'}
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
          onClose={() => setShowLanguages(false)}
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
          onClose={() => setShowFamilyTree(false)}
        />
      )}
      {showOrgSearch && world && (
        <OrgSearchModal
          organisms={world.organisms}
          onClose={() => setShowOrgSearch(false)}
        />
      )}
      {showStats && world && (
        <StatsModal
          world={world}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  )
}

export default App
