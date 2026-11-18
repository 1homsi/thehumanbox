import clsx from 'clsx'
import { useEffect, type ReactNode } from 'react'
import { useNerdStats, useUIStore } from '../../state/store'
import type { ViewFlags } from '../../state/ui/types'
import { saveMapPicture } from '../../shared/mapPicture'
import { shareWorldCard } from '../../shared/shareWorld'
import { useWorldStore } from '../../state/worldStore'
import { Tooltip } from './Tooltip'
import { ToolSprite } from './ToolSprite'
import { saveBlocked, saveLabel, saveShortcutLabel, type WorldActions } from './world-actions'
import { t, type MessageKey } from '../../i18n'
import { PAUSE_TRIGGERS } from '../../game/model/pause-on'

/**
 * A menu icon drawn as a pixel sprite. Used where no common font has the symbol: on stock Linux ⌖ and ⌕ (Misc
 * Technical) and ⏳ ⏱ ⏸ (emoji) came out as empty boxes (#925).
 */
function MenuGlyph({ icon }: { icon: string }) {
  return (
    <span className="menu-glyph">
      <ToolSprite icon={icon} size={11} />
    </span>
  )
}

type Focus = 'sick' | 'hungry' | 'elders' | 'builders' | 'thriving'

const FOCUSES: { id: Focus; icon: ReactNode }[] = [
  { id: 'sick', icon: '🤒' },
  { id: 'hungry', icon: '😫' },
  { id: 'elders', icon: '👴' },
  { id: 'builders', icon: '🏗' },
  { id: 'thriving', icon: '✦' },
]

interface FlagItem {
  flag: keyof ViewFlags
  icon: ReactNode
  label: MessageKey
  tip: MessageKey
}

const MAP_MARKS: FlagItem[] = [
  { flag: 'lineageDot', icon: '⬤', label: 'dock.more.lineage', tip: 'dock.more.lineageTip' },
  { flag: 'health', icon: '♥', label: 'dock.more.health', tip: 'dock.more.healthTip' },
  { flag: 'age', icon: <MenuGlyph icon="⏳" />, label: 'dock.more.age', tip: 'dock.more.ageTip' },
  { flag: 'fear', icon: '⚠', label: 'dock.more.fear', tip: 'dock.more.fearTip' },
  { flag: 'partners', icon: '♥♥', label: 'dock.more.pairs', tip: 'dock.more.pairsTip' },
  { flag: 'pregnancy', icon: '◯', label: 'dock.more.pregnant', tip: 'dock.more.pregnantTip' },
  { flag: 'structures', icon: '⌂', label: 'dock.more.builds', tip: 'dock.more.buildsTip' },
]

const NERD_OVERLAYS: FlagItem[] = [
  { flag: 'trails', icon: '⋯', label: 'dock.more.trails', tip: 'dock.more.trailsTip' },
  { flag: 'fertility', icon: '✿', label: 'dock.more.fertility', tip: 'dock.more.fertilityTip' },
  { flag: 'hazard', icon: '✶', label: 'dock.more.hazard', tip: 'dock.more.hazardTip' },
  { flag: 'history', icon: '↝', label: 'dock.more.history', tip: 'dock.more.historyTip' },
  { flag: 'owners', icon: '▣', label: 'dock.more.owners', tip: 'dock.more.ownersTip' },
  { flag: 'fps', icon: <MenuGlyph icon="⏱️" />, label: 'dock.more.perf', tip: 'dock.more.perfTip' },
]

function FlagButton({ item }: { item: FlagItem }) {
  const on = useUIStore((s) => !!s.viewFlags[item.flag])
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  return (
    <Tooltip tip={t(item.tip)}>
      <button
        className={clsx('lang-btn', on && 'active')}
        aria-pressed={on}
        onClick={() => setViewFlag(item.flag, !on)}
      >
        {item.icon} {t(item.label)}
      </button>
    </Tooltip>
  )
}

/**
 * `onAction` runs whenever the dropdown closes (an action or a toggle). `worldActions` puts
 * "Find a tool" and "Save world" at the top; the phone menu has rows of its own for them.
 */
export function MoreDropdown({
  onAction,
  worldActions,
}: { onAction?: () => void; worldActions?: WorldActions } = {}) {
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  const nerdStats = useNerdStats()
  const viewFlags = useUIStore((s) => s.viewFlags)
  const openLanguages = useUIStore((s) => s.openLanguages)
  const openFamilyTree = useUIStore((s) => s.openFamilyTree)
  const openAchievements = useUIStore((s) => s.openAchievements)
  const openGoals = useUIStore((s) => s.openGoals)
  const openScenarios = useUIStore((s) => s.openScenarios)
  const openNotable = useUIStore((s) => s.openNotable)
  const pauseOn = useUIStore((s) => s.pauseOn)
  const setPauseOn = useUIStore((s) => s.setPauseOn)

  const closeMore = () => {
    useUIStore.setState({ showMore: false })
    onAction?.()
  }

  // Escape closes the menu, as a click elsewhere does, and hands focus back to the ⋯ button: a key pressed
  // inside the menu would otherwise leave focus on the body, where the map's keys stop working. It is taken on
  // the document, ahead of the window, where the app's own Escape (which disarms the held tool) listens.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const trigger = document.querySelector<HTMLElement>('[data-tour="more-btn"][aria-expanded="true"]')
      useUIStore.setState({ showMore: false })
      trigger?.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const { findTool, save } = worldActions ?? {}
  const nerdOverlays = NERD_OVERLAYS.filter((item) => nerdStats || viewFlags[item.flag])

  const screens: { id: string; icon: ReactNode; label: MessageKey; tip: MessageKey; open: () => void }[] = [
    { id: 'goals', icon: '◎', label: 'dock.more.goals', tip: 'dock.more.goalsTip', open: openGoals },
    { id: 'feats', icon: '★', label: 'dock.more.feats', tip: 'dock.more.featsTip', open: openAchievements },
    { id: 'scenes', icon: '✦', label: 'dock.more.scenes', tip: 'dock.more.scenesTip', open: openScenarios },
    {
      id: 'tree',
      icon: '⬡',
      label: 'dock.more.tree',
      tip: 'dock.more.treeTip',
      open: () => openFamilyTree(),
    },
    {
      id: 'notable',
      icon: '◆',
      label: 'dock.more.notable',
      tip: 'dock.more.notableTip',
      open: openNotable,
    },
    {
      id: 'lang',
      icon: <MenuGlyph icon="💭" />,
      label: 'dock.more.lang',
      tip: 'dock.more.langTip',
      open: openLanguages,
    },
    {
      id: 'share',
      icon: '↗',
      label: 'share.menu',
      tip: 'share.menuTip',
      open: () => {
        const world = useWorldStore.getState().world
        if (world) void shareWorldCard(world)
      },
    },
    {
      id: 'picture',
      icon: '▣',
      label: 'dock.more.picture',
      tip: 'dock.more.pictureTip',
      open: () => void saveMapPicture(useWorldStore.getState().world?.tick),
    },
  ]

  return (
    <div className="more-dropdown">
      {(findTool || save) && (
        <>
          <div className="more-dropdown-actions">
            {findTool && (
              <button
                type="button"
                className="more-dropdown-action"
                onClick={() => {
                  closeMore()
                  findTool()
                }}
              >
                <span>
                  <MenuGlyph icon="🔍" /> {t('dock.more.findTool')}
                </span>
                <kbd>/</kbd>
              </button>
            )}
            {save && (
              <button
                type="button"
                className={clsx('more-dropdown-action', save.error && 'error', save.busy && 'busy')}
                onClick={save.onSave}
                disabled={saveBlocked(save)}
                aria-busy={save.busy}
                aria-keyshortcuts="Meta+S Control+S"
              >
                <span>{saveLabel(save)}</span>
                <kbd>{saveShortcutLabel()}</kbd>
                {save.status && (
                  <small className="more-dropdown-status" role="status">
                    {save.status}
                  </small>
                )}
              </button>
            )}
          </div>
          <div className="more-dropdown-divider" />
        </>
      )}
      <div className="more-dropdown-section">{t('dock.more.focus')}</div>
      <div className="more-dropdown-grid" role="group" aria-label={t('dock.more.focus')}>
        <Tooltip tip={t('dock.more.showAllTip')}>
          <button
            className={clsx('lang-btn', focus === 'all' && 'active')}
            aria-pressed={focus === 'all'}
            onClick={() => setFocus('all')}
          >
            · {t('dock.more.all')}
          </button>
        </Tooltip>
        {FOCUSES.map(({ id, icon }) => (
          <Tooltip key={id} tip={t(`dock.more.${id}Tip`)}>
            <button
              className={clsx('lang-btn', focus === id && 'active')}
              aria-pressed={focus === id}
              onClick={() => setFocus(focus === id ? 'all' : id)}
            >
              {icon} {t(`dock.more.${id}`)}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">{t('dock.more.decorations')}</div>
      <div className="more-dropdown-grid" role="group" aria-label={t('dock.more.decorations')}>
        {MAP_MARKS.map((item) => (
          <FlagButton key={item.flag} item={item} />
        ))}
      </div>
      {nerdOverlays.length > 0 && (
        <>
          <Tooltip tip={t('dock.more.nerdOverlaysTip')}>
            <div className="more-dropdown-section more-dropdown-nerd">{t('dock.more.nerdOverlays')}</div>
          </Tooltip>
          <div className="more-dropdown-grid" role="group" aria-label={t('dock.more.nerdOverlays')}>
            {nerdOverlays.map((item) => (
              <FlagButton key={item.flag} item={item} />
            ))}
          </div>
        </>
      )}

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">
        <MenuGlyph icon="⏸️" /> {t('dock.more.pauseOn')}
      </div>
      <div className="more-dropdown-grid" role="group" aria-label={t('dock.more.pauseOnTip')}>
        {PAUSE_TRIGGERS.map((trigger) => (
          <Tooltip key={trigger} tip={t(`dock.more.pauseTip.${trigger}`)}>
            <button
              className={clsx('lang-btn', pauseOn[trigger] && 'active')}
              aria-pressed={pauseOn[trigger]}
              onClick={() => setPauseOn(trigger, !pauseOn[trigger])}
            >
              {t(`dock.more.pause.${trigger}`)}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">{t('dock.more.screens')}</div>
      <div className="more-dropdown-grid" role="group" aria-label={t('dock.more.screens')}>
        {screens.map((screen) => (
          <Tooltip key={screen.id} tip={t(screen.tip)}>
            <button
              className="lang-btn"
              onClick={() => {
                screen.open()
                closeMore()
              }}
            >
              {screen.icon} {t(screen.label)}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
