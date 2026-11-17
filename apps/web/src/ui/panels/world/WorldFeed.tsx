import { useMemo } from 'react'
import clsx from 'clsx'
import type { WorldState } from '../../../shared/types'
import { agoOf, eventLine, feedTone, worldFeed, type FeedItem } from '../../../game/model/world-feed'
import { eventTarget } from '../../../game/model/event-target'
import { PERIL_HELP, tribeHome } from '../../../game/model/tribe-peril'
import { EVENT_ICONS } from '../../../shared/constants'
import { tribeFocus } from '../../../shared/viewerSelection'
import { useCameraFocus } from '../../../state/camera-focus'
import { useUIStore } from '../../../state/store'
import { useIsMobile } from '../../../shared/hooks/useIsMobile'
import { formatNumber, t } from '../../../i18n'
import { ToolSprite } from '../../toolbar/ToolSprite'
import { SectionHead } from './InfoTip'

type FeedWorld = Parameters<typeof worldFeed>[0] &
  Pick<WorldState, 'tick' | 'tribe_chronicle' | 'settlements' | 'organisms'>

const SEASON_ICON = { drought: '🏜️', hardWinter: '🥶', hardWinterAhead: '❄️' } as const

const EVENT_SPRITE: Record<string, string> = {
  prayer: '🙏',
  answered: '✨',
  forsaken: '🥀',
  outbreak: '🦠',
  disease_death: '🦠',
  building_ruined: '🔨',
  meteor: '☄️',
  era: '💡',
  era_advance: '💡',
  smite: '⚡',
  war_declared: '⚔️',
  battle: '⚔️',
  treaty: '🕊️',
  weather: '🌧️',
  drought: '🏜️',
  milestone: '⭐',
  eruption: '🌋',
  danger: '⚠️',
  theft: '🪙',
  murder: '🗡️',
  trade_route: '🐫',
  died: '💀',
  born: '👪',
}

function itemIcon(item: FeedItem): string {
  if (item.kind === 'peril') return '⚠️'
  if (item.kind === 'war') return '⚔️'
  if (item.kind === 'season') return SEASON_ICON[item.what]
  return EVENT_SPRITE[item.event.type] ?? '📜'
}

function itemText(item: FeedItem): { lead?: string; text: string } {
  if (item.kind === 'peril') {
    const help = PERIL_HELP[item.cause as keyof typeof PERIL_HELP]
    return {
      lead: item.tribe,
      text: t('panels.world.feed.peril', { reason: help ? t(help.reason) : item.cause }),
    }
  }
  if (item.kind === 'war') return { text: t('panels.world.feed.war', { a: item.a, b: item.b }) }
  if (item.kind === 'season') return { text: t(`panels.world.feed.${item.what}`) }
  return eventLine(item.event)
}

function agoText(now: number, tick: number): string {
  const ago = agoOf(now, tick)
  if (ago.unit === 'now') return t('panels.world.feed.now')
  if (ago.unit === 'days') return t('panels.world.feed.days', { count: formatNumber(ago.count) })
  return t('panels.world.feed.years', { count: formatNumber(ago.count) })
}

function flyTo(item: FeedItem, world: FeedWorld): boolean {
  const camera = useCameraFocus.getState()
  const ui = useUIStore.getState()
  if (item.kind === 'peril') {
    ui.setFocus(tribeFocus(item.lineage, world))
    const home = tribeHome(world, item.lineage)
    if (home) camera.focusTile(Math.round(home.x), Math.round(home.y))
    return true
  }
  if (item.kind === 'war') {
    camera.focusTile(Math.round(item.at.x), Math.round(item.at.y))
    return true
  }
  if (item.kind === 'event') {
    const target = eventTarget(world, item.event)
    if (!target) return false
    if (target.kind === 'tribe') ui.setFocus(tribeFocus(target.lineage, world))
    else ui.selectOrg(target.id)
    if (target.at) camera.focusTile(Math.round(target.at.x), Math.round(target.at.y))
    return true
  }
  return false
}

export function WorldFeed({ world }: { world: FeedWorld }) {
  const isMobile = useIsMobile()
  const openChronicles = useUIStore((s) => s.openChronicles)
  const {
    events,
    battles,
    tribes_in_peril,
    tribe_losses,
    lineage_sizes,
    drought,
    hard_winter,
    hard_winter_ahead,
    lineage_names,
  } = world
  const items = useMemo(
    () =>
      worldFeed({
        events,
        battles,
        tribes_in_peril,
        tribe_losses,
        lineage_sizes,
        drought,
        hard_winter,
        hard_winter_ahead,
        lineage_names,
      }),
    [
      events,
      battles,
      tribes_in_peril,
      tribe_losses,
      lineage_sizes,
      drought,
      hard_winter,
      hard_winter_ahead,
      lineage_names,
    ],
  )

  return (
    <section className="wp-feed">
      <SectionHead title={t('panels.world.feed.title')} tip={t('panels.world.feed.tip')} />
      {items.length === 0 ? (
        <p className="wp-quiet">{t('panels.world.feed.quiet')}</p>
      ) : (
        <ul className="wp-feed-list">
          {items.map((item) => {
            const { lead, text } = itemText(item)
            const tone = feedTone(item)
            const canFly = item.kind !== 'season'
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={clsx('wp-feed-item', `tone-${tone}`)}
                  disabled={!canFly}
                  title={
                    canFly
                      ? `${lead ? `${lead} ` : ''}${text} · ${t('panels.world.feed.goThere')}`
                      : undefined
                  }
                  onClick={() => {
                    if (flyTo(item, world) && isMobile) useUIStore.getState().toggleLeft()
                  }}
                >
                  <span className="wp-feed-icon" aria-hidden="true">
                    {item.kind === 'event' && !EVENT_SPRITE[item.event.type] ? (
                      (EVENT_ICONS[item.event.type] ?? '·')
                    ) : (
                      <ToolSprite icon={itemIcon(item)} size={16} />
                    )}
                  </span>
                  <span className="wp-feed-text">
                    <span className="wp-feed-body">
                      {lead && <strong>{lead} </strong>}
                      {text}
                    </span>
                    {item.kind === 'event' && (
                      <span className="wp-feed-ago">{agoText(world.tick, item.event.tick)}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        className="wp-link"
        onClick={() => {
          openChronicles()
          if (isMobile) useUIStore.getState().toggleLeft()
        }}
      >
        <ToolSprite icon="📖" size={12} /> {t('panels.world.feed.chronicles')}
      </button>
    </section>
  )
}
