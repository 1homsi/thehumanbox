import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { PrayerInfo, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { Tooltip } from './Tooltip'
import { MoreDropdown } from './MoreDropdown'
import { ToolSprite } from './ToolSprite'
import { vegetationSeason } from '../../game/render/landscape-style'

// The simulation names seasons by what they do to food; the header shows
// the calendar name (autumn used to read as "decline", as if the world
// were dying) and explains the effect in the tooltip.
const SEASON_TIPS: Record<string, string> = {
  recovery: 'The land is recovering. Food starts growing back.',
  abundance: 'Food is plentiful.',
  decline: 'Food growth is slowing ahead of winter.',
  scarcity: 'Food is scarce. Winter is the hardest season.',
}
import { getDesktop } from '../../shared/desktop'
import { PrayerChip } from '../panels/PrayerChip'
import { PerilChip } from '../panels/PerilChip'

interface Props {
  world: WorldState | null
  connected: boolean
  sickOrgs: number
  onAnswerPrayer: (prayer: PrayerInfo) => void
}

export function AppHeader({ world, connected, sickOrgs, onAnswerPrayer }: Props) {
  const showMore = useUIStore((s) => s.showMore)
  const panelOpen = useUIStore((s) => s.panelOpen)
  const isFullscreen = useUIStore((s) => s.isFullscreen)
  const nerdStats = useUIStore((s) => s.nerdStats)

  const togglePanel = useUIStore((s) => s.togglePanel)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const toggleMore = useUIStore((s) => s.toggleMore)
  const openStats = useUIStore((s) => s.openStats)
  const openOrgSearch = useUIStore((s) => s.openOrgSearch)
  const openChronicles = useUIStore((s) => s.openChronicles)
  const openCiv = useUIStore((s) => s.openCiv)
  const openSettings = useUIStore((s) => s.openDesktopSettings)
  const setFullscreen = useUIStore((s) => s.setFullscreen)

  const moreRef = useRef<HTMLDivElement>(null)
  const livePopulation = world?.lineage_sizes?.reduce((total, lineage) => total + lineage.count, 0) ?? 0
  const nextPopulationMilestone = [100, 250, 500, 1000, 2500, 5000].find((target) => target > livePopulation)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setFullscreen(true))
        .catch(() => {})
    } else {
      document
        .exitFullscreen()
        .then(() => setFullscreen(false))
        .catch(() => {})
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

  const tip = (title: string, body?: string, how?: string) => (
    <span className="tip-card">
      <span className="tip-title">{title}</span>
      {body && <span className="tip-body">{body}</span>}
      {how && <span className="tip-how">{how}</span>}
    </span>
  )

  return (
    <header className="header">
      <MacUpdateControl />
      <div className="header-left">
        <h1>
          <ToolSprite icon="🌼" size={24} />
          <span>The Human Box</span>
        </h1>
        <Tooltip tip={tip('GitHub', 'View the source code for The Human Box.')}>
          <a
            className="github-link"
            href="https://github.com/stackxio/thehumanbox"
            target="_blank"
            rel="noreferrer"
            aria-label="View on GitHub"
          >
            <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.111.82-.261.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </Tooltip>
        {nerdStats && (
          <span className={clsx('status', connected && world ? 'online' : 'offline')}>
            <span className="status-dot" />
            {connected && world ? 'LIVE' : 'connecting...'}
          </span>
        )}
        {!nerdStats && (!connected || !world) && (
          <span className="status offline">
            <span className="status-dot" />
            connecting...
          </span>
        )}
        {nerdStats && world && (
          <Tooltip
            tip={`Simulation tick ${world.tick.toLocaleString()} - 600 ticks = 1 in-world day · ${Math.floor(world.tick / 600)} days elapsed`}
          >
            <span className="tick" style={{ cursor: 'default' }}>
              tick {world.tick.toLocaleString()}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="header-badges">
        {world && <PerilChip world={world} />}
        {world && <PrayerChip world={world} onAnswer={onAnswerPrayer} />}
        {world && livePopulation > 0 && (
          <Tooltip
            tip={tip(
              'people',
              `${livePopulation.toLocaleString()} alive.`,
              nextPopulationMilestone
                ? `next milestone ${nextPopulationMilestone.toLocaleString()}`
                : undefined,
            )}
          >
            <span className={clsx('hdr-chip', 'population-badge')}>
              <ToolSprite icon="🚶" size={16} />
              {livePopulation.toLocaleString()}
            </span>
          </Tooltip>
        )}
        {world && (
          <Tooltip
            tip={tip(
              world.is_day ? 'daytime' : 'nighttime',
              `${Math.round((world.day_progress ?? 0) * 100)}% through the day.`,
            )}
          >
            <span className="hdr-chip daynight">
              <ToolSprite icon={world.is_day ? '☀️' : '🌙'} size={16} />
              <span className="hdr-chip-label">{world.is_day ? 'day' : 'night'}</span>
            </span>
          </Tooltip>
        )}
        {world && (
          <Tooltip
            tip={
              world.hard_winter
                ? tip(
                    'hard winter',
                    'Colder than usual. Wild food dies back fast and fevers spread.',
                    'Tribes will pray for food and cures.',
                  )
                : world.hard_winter_ahead
                  ? tip(
                      `${vegetationSeason(world.season)} · hard winter ahead`,
                      'The elders fear a hard winter. Wild food will be scarce and fevers will spread.',
                      'Plant crops and orchards now, before the cold comes.',
                    )
                  : tip(
                      vegetationSeason(world.season),
                      SEASON_TIPS[world.season] ?? 'Affects food growth and drought risk.',
                    )
            }
          >
            <span
              className={clsx(
                'hdr-chip',
                'season-badge',
                `season-${world.season}`,
                world.hard_winter && 'hard-winter',
              )}
            >
              {world.hard_winter ? 'hard winter' : vegetationSeason(world.season)}
              {world.hard_winter_ahead && !world.hard_winter && (
                <span className="season-omen" aria-label="hard winter ahead">
                  ❄
                </span>
              )}
            </span>
          </Tooltip>
        )}
        {world?.cosmos &&
          (() => {
            const label = world.cosmos.moon_phase.replace(/_/g, ' ')
            return (
              <Tooltip
                tip={tip(
                  `moon: ${label}`,
                  `Year ${world.cosmos.year + 1}, day ${world.cosmos.day_of_year + 1}.`,
                )}
              >
                <span className="hdr-chip moon-badge">
                  <ToolSprite icon="🌙" size={16} />
                  <span className="hdr-chip-label">{label}</span>
                </span>
              </Tooltip>
            )
          })()}
        {world?.current_era && world.current_era !== 'genesis' && world.current_era !== 'equilibrium' && (
          <Tooltip tip={tip(`era: ${world.current_era}`, 'Shapes resources and how people behave.')}>
            <span className={clsx('hdr-chip', 'era-badge', `era-${world.current_era}`)}>
              {world.current_era}
            </span>
          </Tooltip>
        )}
        {world?.drought && (
          <Tooltip tip={tip('drought', 'Water is shrinking and thirst deaths are rising.')}>
            <span className="hdr-chip drought-badge">
              <ToolSprite icon="🏜️" size={16} />
              drought
            </span>
          </Tooltip>
        )}
        {world?.weather?.kind === 'rain' && (
          <Tooltip tip={tip('rain', 'Helps dry land recover faster.')}>
            <span className="hdr-chip weather-badge rain">
              <ToolSprite icon="🌧️" size={16} />
              rain
            </span>
          </Tooltip>
        )}
        {world?.weather?.kind === 'storm' && (
          <Tooltip tip={tip('storm', 'Drains energy. Lightning can strike.')}>
            <span className="hdr-chip weather-badge storm">
              <ToolSprite icon="⛈️" size={16} />
              storm
            </span>
          </Tooltip>
        )}
        {sickOrgs > 0 && (
          <Tooltip
            tip={tip(
              'sickness',
              `${sickOrgs} ${sickOrgs > 1 ? 'people are' : 'person is'} sick. It spreads through close contact.`,
            )}
          >
            <span className="hdr-chip sick-badge">
              <ToolSprite icon="🦠" size={16} />
              {sickOrgs}
            </span>
          </Tooltip>
        )}
      </div>
      {world && (
        <div className="header-actions">
          <Tooltip tip={tip('stats', 'Population graphs, births and deaths, and lineage growth over time.')}>
            <button className="hdr-btn" data-tour="stats-btn" onClick={openStats}>
              <ToolSprite icon="📊" size={16} />
              <span className="btn-label">stats</span>
            </button>
          </Tooltip>
          <Tooltip
            tip={tip('civilization', 'Eras, governments, religions, buildings, books, art, and headlines.')}
          >
            <button className="hdr-btn" data-tour="civ-btn" onClick={openCiv}>
              <ToolSprite icon="👑" size={16} />
              <span className="btn-label">civ</span>
            </button>
          </Tooltip>
          <Tooltip
            tip={tip(
              'find people',
              'Search everyone, alive or dead, by name, thought, lineage, or discovery.',
            )}
          >
            <button className="hdr-btn" data-tour="search-btn" onClick={openOrgSearch}>
              <ToolSprite icon="🔍" size={16} />
              <span className="btn-label">search</span>
            </button>
          </Tooltip>
          <Tooltip tip={tip('chronicles', 'The history of this world, written from what has happened.')}>
            <button className="hdr-btn" data-tour="chronicles-btn" onClick={openChronicles}>
              <ToolSprite icon="📖" size={16} />
              <span className="btn-label">chronicles</span>
              {world.story_history?.length > 0 && (
                <span className="btn-count">{world.story_history.length}</span>
              )}
            </button>
          </Tooltip>
          <div className="more-menu" ref={moreRef}>
            <Tooltip tip={tip('more', 'Overlays, focus filters, and view options.')}>
              <button
                className={clsx('hdr-btn', showMore && 'active')}
                data-tour="more-btn"
                onClick={toggleMore}
                aria-expanded={showMore}
              >
                <ToolSprite icon="⋯" size={16} />
                <span className="btn-label">more</span>
              </button>
            </Tooltip>
            {showMore && <MoreDropdown />}
          </div>
          <Tooltip tip={tip('settings', 'World source and local simulation options.')}>
            <button className="hdr-btn" data-tour="settings-btn" onClick={openSettings} aria-label="Settings">
              <ToolSprite icon="⚙️" size={16} />
              <span className="btn-label">settings</span>
            </button>
          </Tooltip>
        </div>
      )}
      {world && (
        <div className="header-panels">
          <Tooltip
            tip={tip(leftOpen ? 'close world panel' : 'world panel', 'History, lineages, and the event log.')}
          >
            <button
              className={clsx('hdr-btn', 'panel-toggle-btn', 'panel-toggle-left')}
              onClick={toggleLeft}
              aria-pressed={leftOpen}
              aria-label={leftOpen ? 'Close world panel' : 'Open world panel'}
            >
              <ToolSprite icon="◧" size={16} />
              <span className="btn-label">world</span>
            </button>
          </Tooltip>
          <Tooltip
            tip={tip(panelOpen ? 'close people panel' : 'people panel', 'Everyone alive, plus the dead.')}
          >
            <button
              className={clsx('hdr-btn', 'panel-toggle-btn')}
              onClick={togglePanel}
              aria-pressed={panelOpen}
              aria-label={panelOpen ? 'Close orgs panel' : 'Open orgs panel'}
            >
              <ToolSprite icon="◨" size={16} />
              <span className="btn-label">orgs</span>
            </button>
          </Tooltip>
          <Tooltip tip={tip(isFullscreen ? 'exit fullscreen' : 'fullscreen')}>
            <button
              className={clsx('hdr-btn', 'fullscreen-btn')}
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              <ToolSprite icon="⛶" size={16} />
            </button>
          </Tooltip>
        </div>
      )}
    </header>
  )
}

function MacUpdateControl() {
  const desktop = getDesktop()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('Check for updates')

  if (!desktop || desktop.platform !== 'darwin') return null

  async function check() {
    if (!desktop || checking) return
    setChecking(true)
    setMessage('Checking...')
    try {
      const result = await desktop.app.checkForUpdates()
      if (result.status === 'available') {
        setMessage(result.version ? `v${result.version} available` : 'Update available')
      } else if (result.status === 'downloaded') {
        setMessage(result.version ? `v${result.version} ready` : 'Update ready')
      } else if (result.status === 'up-to-date') {
        setMessage('Up to date')
      } else if (result.status === 'unsupported') {
        setMessage('Packaged app only')
      } else {
        setMessage('Check failed')
      }
    } finally {
      setChecking(false)
      window.setTimeout(() => setMessage('Check for updates'), 3500)
    }
  }

  return (
    <Tooltip tip={message}>
      <button
        type="button"
        className={clsx('mac-update-btn', checking && 'checking')}
        onClick={check}
        disabled={checking}
        aria-label="Check for updates"
      >
        ↻
      </button>
    </Tooltip>
  )
}
