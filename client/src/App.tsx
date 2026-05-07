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
          <span className={`status ${connected ? 'online' : 'offline'}`}>
            {connected ? '● LIVE' : '○ connecting...'}
          </span>
          {world && <span className="tick">tick {world.tick.toLocaleString()}</span>}
        </div>
        <div className="header-badges">
          {world && <span className="daynight">{world.is_day ? '☀️ day' : '🌙 night'}</span>}
          {world && <span className={`season-badge season-${world.season}`} title="Current season — affects food growth rate, drought risk, and organism energy drain">{world.season}</span>}
          {world?.current_era && world.current_era !== 'genesis' && world.current_era !== 'equilibrium' && (
            <span className={`era-badge era-${world.current_era}`} title={`Current world era: ${world.current_era}`}>{world.current_era}</span>
          )}
          {world?.drought && <span className="drought-badge" title="Drought active — water tiles shrinking, dehydration deaths rising">drought</span>}
          {world?.weather?.kind === 'rain'  && <span className="weather-badge rain" title="Rain — extinguishing fires, refilling water sources">🌧 rain</span>}
          {world?.weather?.kind === 'storm' && <span className="weather-badge storm" title="Storm — draining organism energy, lightning strikes possible">⛈ storm</span>}
          {fireTiles > 0 && <span className="fire-badge" title={`${fireTiles} tiles currently on fire — spreading to nearby flammable terrain`}>🔥 {fireTiles}</span>}
          {sickOrgs  > 0 && <span className="sick-badge" title={`${sickOrgs} organism${sickOrgs > 1 ? 's' : ''} infected — sickness spreads through close contact`}>🤒 {sickOrgs}</span>}
        </div>
        {world && (
          <div className="header-actions">
            <button className={`lang-btn${leftOpen ? ' active' : ''}`} onClick={() => setLeftOpen(p => !p)}>⊞ world</button>
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
                  <button className={`lang-btn overlay-btn${overlay === 'fertility' ? ' active' : ''}`} onClick={() => { setOverlay(o => o === 'fertility' ? null : 'fertility'); setShowMore(false) }} title="Soil fertility">🌱 soil</button>
                  <button className={`lang-btn overlay-btn${overlay === 'hazard' ? ' active' : ''}`} onClick={() => { setOverlay(o => o === 'hazard' ? null : 'hazard'); setShowMore(false) }} title="Hazard memory">☠ hazard</button>
                  <button className={`lang-btn overlay-btn${overlay === 'pressure' ? ' active' : ''}`} onClick={() => { setOverlay(o => o === 'pressure' ? null : 'pressure'); setShowMore(false) }} title="Migration trails">👣 trails</button>
                  <div className="more-dropdown-divider" />
                  <button className="lang-btn" onClick={() => { setShowLanguages(true); setShowMore(false) }}>⌖ lang</button>
                  <button className="lang-btn" onClick={() => { setShowFamilyTree(true); setShowMore(false) }}>⬡ tree</button>
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
          {isFullscreen ? '⊡' : '⊞'}
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
