import { useCallback, useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { WorldState } from '../types'
import { useUIStore } from '../store'
import { Tooltip } from './Tooltip'
import { MoreDropdown } from './MoreDropdown'

interface Props {
  world: WorldState | null
  connected: boolean
  fireTiles: number
  sickOrgs: number
}

export function AppHeader({ world, connected, fireTiles, sickOrgs }: Props) {
  const showMore     = useUIStore(s => s.showMore)
  const panelOpen    = useUIStore(s => s.panelOpen)
  const isFullscreen = useUIStore(s => s.isFullscreen)

  const togglePanel    = useUIStore(s => s.togglePanel)
  const toggleMore     = useUIStore(s => s.toggleMore)
  const openStats      = useUIStore(s => s.openStats)
  const openOrgSearch  = useUIStore(s => s.openOrgSearch)
  const openChronicles = useUIStore(s => s.openChronicles)
  const setFullscreen  = useUIStore(s => s.setFullscreen)

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

  return (
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
            {showMore && <MoreDropdown />}
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
  )
}
