import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { PrayerInfo, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { Tooltip } from './Tooltip'
import { MoreDropdown } from './MoreDropdown'
import { PhoneMenu } from './PhoneMenu'
import { ToolSprite } from './ToolSprite'
import { getDesktop } from '../../shared/desktop'
import { canUseFullscreen, toggleElementFullscreen } from '../../shared/fullscreen'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import { PrayerChip } from '../panels/PrayerChip'
import { PerilChip } from '../panels/PerilChip'
import { CalendarTag } from '../panels/CalendarTag'
import { PopulationChip } from '../panels/PopulationChip'
import { WeatherChip } from '../panels/WeatherChip'
import type { WorldActions } from './world-actions'
import { formatNumber, t } from '../../i18n'
import { updateCheckMessage } from '../modals/updateCheckMessage'

interface Props {
  world: WorldState | null
  connected: boolean
  sickOrgs: number
  onAnswerPrayer: (prayer: PrayerInfo) => void
  /** Find a tool and save the world, offered first in the ⋯ menu and the phone menu. */
  worldActions?: WorldActions
}

export function AppHeader({ world, connected, sickOrgs, onAnswerPrayer, worldActions }: Props) {
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
  // iPhone Safari has no element fullscreen; hide the toggle rather than throw on every tap.
  const fullscreenAvailable = canUseFullscreen()

  const toggleFullscreen = useCallback(() => {
    // iPhone Safari has no element fullscreen: the toggle is hidden there, but never call it blind.
    void toggleElementFullscreen().then((on) => setFullscreen(on))
  }, [setFullscreen])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [setFullscreen])

  useEffect(() => {
    if (!showMore) return
    // pointerdown, not mousedown: a tap on a non-clickable surface like the map canvas makes iOS
    // Safari skip the emulated mouse events, so this dismisser never fired on touch.
    const handler = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        useUIStore.setState({ showMore: false })
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
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
        <Tooltip tip={tip(t('header.starTitle'), t('header.starBody'))}>
          <a
            className="hdr-btn star-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={t('header.starAria')}
            onClick={() => trackEvent('star_link_clicked', { source: 'header' })}
          >
            <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.111.82-.261.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <ToolSprite icon="⭐" size={14} />
            <span className="btn-label">{t('header.star')}</span>
          </a>
        </Tooltip>
        {nerdStats && (
          <span className={clsx('status', connected && world ? 'online' : 'offline')}>
            <span className="status-dot" />
            {connected && world ? t('header.live') : t('header.connecting')}
          </span>
        )}
        {!nerdStats && (!connected || !world) && (
          <span className="status offline">
            <span className="status-dot" />
            {t('header.connecting')}
          </span>
        )}
        {nerdStats && world && (
          <Tooltip
            tip={t('header.tickTip', {
              tick: formatNumber(world.tick),
              days: formatNumber(Math.floor(world.tick / 600)),
            })}
          >
            <span className="tick" style={{ cursor: 'default' }}>
              {t('header.tick', { tick: formatNumber(world.tick) })}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="header-badges">
        {world && <CalendarTag world={world} />}
        {world && <PerilChip world={world} />}
        {world && <PrayerChip world={world} onAnswer={onAnswerPrayer} />}
        {world && <PopulationChip population={livePopulation} sick={sickOrgs} />}
        {world?.cosmos &&
          (() => {
            const label = world.cosmos.moon_phase.replace(/_/g, ' ')
            return (
              <Tooltip
                tip={tip(
                  t('header.moonTitle', { phase: label }),
                  t('header.moonBody', { year: world.cosmos.year + 1, day: world.cosmos.day_of_year + 1 }),
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
          <Tooltip tip={tip(t('header.eraTitle', { era: world.current_era }), t('header.eraBody'))}>
            <span className={clsx('hdr-chip', 'era-badge', `era-${world.current_era}`)}>
              {world.current_era}
            </span>
          </Tooltip>
        )}
        {world && <WeatherChip world={world} />}
      </div>
      {world && (
        <div className="header-actions">
          <Tooltip tip={tip(t('header.stats'), t('header.statsBody'))}>
            <button className="hdr-btn" data-tour="stats-btn" onClick={openStats}>
              <ToolSprite icon="📊" size={16} />
              <span className="btn-label">{t('header.stats')}</span>
            </button>
          </Tooltip>
          <Tooltip tip={tip(t('header.civTitle'), t('header.civBody'))}>
            <button className="hdr-btn" data-tour="civ-btn" onClick={openCiv}>
              <ToolSprite icon="👑" size={16} />
              <span className="btn-label">{t('header.civ')}</span>
            </button>
          </Tooltip>
          <Tooltip tip={tip(t('header.searchTitle'), t('header.searchBody'))}>
            <button className="hdr-btn" data-tour="search-btn" onClick={openOrgSearch}>
              <ToolSprite icon="🔍" size={16} />
              <span className="btn-label">{t('header.search')}</span>
            </button>
          </Tooltip>
          <Tooltip tip={tip(t('header.chronicles'), t('header.chroniclesBody'))}>
            <button className="hdr-btn" data-tour="chronicles-btn" onClick={openChronicles}>
              <ToolSprite icon="📖" size={16} />
              <span className="btn-label">{t('header.chronicles')}</span>
              {world.story_history?.length > 0 && (
                <span className="btn-count">{world.story_history.length}</span>
              )}
            </button>
          </Tooltip>
          <div className="more-menu" ref={moreRef}>
            <Tooltip tip={tip(t('header.more'), t('header.moreBody'))}>
              <button
                className={clsx('hdr-btn', showMore && 'active')}
                data-tour="more-btn"
                onClick={toggleMore}
                aria-expanded={showMore}
              >
                <ToolSprite icon="⋯" size={16} />
                <span className="btn-label">{t('header.more')}</span>
              </button>
            </Tooltip>
            {showMore && <MoreDropdown worldActions={worldActions} />}
          </div>
          <Tooltip tip={tip(t('header.settings'), t('header.settingsBody'))}>
            <button
              className="hdr-btn"
              data-tour="settings-btn"
              onClick={openSettings}
              aria-label={t('settings.title')}
            >
              <ToolSprite icon="⚙️" size={16} />
              <span className="btn-label">{t('header.settings')}</span>
            </button>
          </Tooltip>
        </div>
      )}
      {world && (
        <div className="header-panels">
          <Tooltip
            tip={tip(
              leftOpen ? t('header.closeWorldPanel') : t('header.worldPanel'),
              t('header.worldPanelBody'),
            )}
          >
            <button
              className={clsx('hdr-btn', 'panel-toggle-btn', 'panel-toggle-left')}
              onClick={toggleLeft}
              aria-pressed={leftOpen}
              aria-label={leftOpen ? t('header.closeWorldPanelAria') : t('header.openWorldPanelAria')}
            >
              <ToolSprite icon="◧" size={16} />
              <span className="btn-label">{t('header.world')}</span>
            </button>
          </Tooltip>
          <Tooltip
            tip={tip(
              panelOpen ? t('header.closePeoplePanel') : t('header.peoplePanel'),
              t('header.peoplePanelBody'),
            )}
          >
            <button
              className={clsx('hdr-btn', 'panel-toggle-btn')}
              onClick={togglePanel}
              aria-pressed={panelOpen}
              aria-label={panelOpen ? t('header.closePeoplePanelAria') : t('header.openPeoplePanelAria')}
            >
              <ToolSprite icon="◨" size={16} />
              <span className="btn-label">{t('header.people')}</span>
            </button>
          </Tooltip>
          {fullscreenAvailable && (
            <Tooltip tip={tip(isFullscreen ? t('header.exitFullscreen') : t('header.fullscreen'))}>
              <button
                className={clsx('hdr-btn', 'fullscreen-btn')}
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? t('header.exitFullscreenAria') : t('header.enterFullscreenAria')}
              >
                <ToolSprite icon="⛶" size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
      {world && (
        <PhoneMenu
          chronicleCount={world.story_history?.length ?? 0}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          worldActions={worldActions}
        />
      )}
    </header>
  )
}

function MacUpdateControl() {
  const desktop = getDesktop()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState(() => t('updates.checkTitle'))

  if (!desktop || desktop.platform !== 'darwin') return null

  async function check() {
    if (!desktop || checking) return
    setChecking(true)
    setMessage(t('updates.checking'))
    try {
      const result = await desktop.app.checkForUpdates()
      setMessage(updateCheckMessage(result.status === 'unsupported' ? { status: 'unsupported' } : result))
    } catch {
      setMessage(t('updates.failed'))
    } finally {
      setChecking(false)
      window.setTimeout(() => setMessage(t('updates.checkTitle')), 3500)
    }
  }

  return (
    <Tooltip tip={message}>
      <button
        type="button"
        className={clsx('mac-update-btn', checking && 'checking')}
        onClick={check}
        disabled={checking}
        aria-label={t('updates.checkTitle')}
      >
        ↻
      </button>
    </Tooltip>
  )
}
