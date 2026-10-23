import { ToolSprite } from './ToolSprite'
import { Tooltip } from './Tooltip'
import { TimeControl } from './TimeControl'
import { toolHowTo, toolName, toolTip } from './tool-tips'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useWorldStore } from '../../state/worldStore'
import clsx from 'clsx'
import {
  SANDBOX_CATEGORIES,
  isSandboxViewControlActive,
  rollRandomEvent,
  type SandboxTool,
  type SandboxViewFlag,
} from '../../simulation/sandbox'
import {
  BRUSH_SIZES,
  DOCK_TABS,
  groupLabel,
  groupsFor,
  markNewToolsSeen,
  readRememberedGroups,
  readSeenNewTools,
  rememberGroup,
  resolveGroup,
  resolveTab,
  tabLabel,
  unseenNewTools,
  unseenNewToolsInGroup,
} from './dock-tabs'
import { hotkeysFor, toolForHotkey } from './tool-hotkeys'
import { typingTarget } from '../../game/model/shortcuts'
import { t } from '../../i18n'

const TAB_STORAGE_KEY = 'thb-sandbox-category'

interface Props {
  armedToolId: string | null
  armedToolLabel?: string | null
  brush: number
  status?: string | null
  runtimePaused?: boolean
  runtimeSpeed?: number
  activeOverlay?: string | null
  activeViewFlags?: Partial<Record<SandboxViewFlag, boolean>>
  onBrush: (n: number) => void
  onPick: (tool: SandboxTool) => void
  onClearArmed: () => void
  onClearView?: () => void
}

function readInitialTab(): string {
  if (typeof window === 'undefined') return DOCK_TABS[0].id
  try {
    return resolveTab(window.localStorage.getItem(TAB_STORAGE_KEY))
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
    return DOCK_TABS[0].id
  }
}

function TipCard({ title, body, how }: { title: string; body?: string; how?: string }) {
  return (
    <span className="tip-card">
      <span className="tip-title">{title}</span>
      {body && <span className="tip-body">{body}</span>}
      {how && <span className="tip-how">{how}</span>}
    </span>
  )
}

const ALL_TOOLS = SANDBOX_CATEGORIES.flatMap((c) => c.tools)

/** Whether a tool's reach changes with the brush, so the brush sizes are worth showing for it. */
function usesBrush(tool: SandboxTool | undefined): boolean {
  if (!tool?.build) return false
  const small = tool.build(0, 0, 0) as { radius?: number; count?: number }
  const large = tool.build(0, 0, 4) as { radius?: number; count?: number }
  return small.radius !== large.radius || small.count !== large.count
}

/** Scrolls the nearest sideways-scrolling line that holds `el` just far enough to show it. */
function revealInLine(el: HTMLElement) {
  for (
    let line = el.parentElement;
    line && !line.classList.contains('sandbox-bar');
    line = line.parentElement
  ) {
    if (line.scrollWidth <= line.clientWidth) continue
    const a = el.getBoundingClientRect()
    const b = line.getBoundingClientRect()
    if (a.left < b.left) line.scrollLeft -= b.left - a.left + 8
    else if (a.right > b.right) line.scrollLeft += a.right - b.right + 8
    return
  }
}

interface DockTileProps {
  tool: SandboxTool
  active: boolean
  flashed: boolean
  hotkey: string | undefined
  body: string
  how: string
  onPick: (tool: SandboxTool) => void
}

/**
 * One tool on the bar: its icon, no frame. Memoized: a pick re-renders the bar to flash its tool,
 * and only that tool's props change, so the others (each with its tooltip and sprite) are not
 * reconciled again.
 */
const DockTile = memo(function DockTile({ tool, active, flashed, hotkey, body, how, onPick }: DockTileProps) {
  return (
    <Tooltip tip={<TipCard title={toolName(tool)} body={body} how={how} />}>
      <button
        type="button"
        className={clsx('dock-tile', active && 'active', flashed && 'flash')}
        data-tool={tool.id}
        aria-label={toolName(tool)}
        aria-keyshortcuts={hotkey}
        aria-pressed={active}
        onClick={() => onPick(tool)}
      >
        <ToolSprite icon={tool.icon} size={26} />
      </button>
    </Tooltip>
  )
})

export function SandboxToolbar({
  armedToolId,
  armedToolLabel,
  brush,
  status,
  runtimePaused = false,
  runtimeSpeed = 1,
  activeOverlay = null,
  activeViewFlags = {},
  onBrush,
  onPick,
  onClearArmed,
}: Props) {
  const [tabId, setTabId] = useState(readInitialTab)
  const [remembered, setRemembered] = useState(readRememberedGroups)
  const groupId = resolveGroup(tabId, remembered[tabId])
  const [seenNew, setSeenNew] = useState(() => markNewToolsSeen(groupId, readSeenNewTools()))
  // Toasts sit above the bar, and its height depends on the viewport, so publish it as a CSS
  // variable instead of hard-coding a guess in three stylesheets.
  const barRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const publish = () => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`)
    publish()
    const obs = new ResizeObserver(publish)
    obs.observe(el)
    return () => {
      obs.disconnect()
      document.documentElement.style.removeProperty('--dock-h')
    }
  }, [])
  const groups = groupsFor(tabId)
  const group = groups.find((g) => g.id === groupId) ?? groups[0]
  const worldGrid = useWorldStore((s) => s.world?.grid)
  const weather = useWorldStore((s) => s.world?.weather?.kind)
  const drought = useWorldStore((s) => s.world?.drought ?? false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const isViewActive = (tool: SandboxTool) =>
    isSandboxViewControlActive(tool.view, activeOverlay, activeViewFlags)
  // Weather and drought are states of the world, so their tools light up
  // while that state holds, and clicking a lit one switches it off.
  const isStateActive = (tool: SandboxTool) =>
    (tool.id === 'rain' && weather === 'rain') ||
    (tool.id === 'storm' && weather === 'storm') ||
    (tool.id === 'snow_weather' && weather === 'snow') ||
    (tool.id === 'fog' && weather === 'fog') ||
    (tool.id === 'drought_on' && drought)
  const engaged = (tools: readonly SandboxTool[]) =>
    tools.some((t) => armedToolId === t.id || isViewActive(t))
  const tabEngaged = (id: string) => engaged(groupsFor(id).flatMap((c) => c.tools))

  const openGroup = (tab: string, id: string) => {
    setSeenNew((seen) => markNewToolsSeen(id, seen))
    setRemembered((prev) => (prev[tab] === id ? prev : rememberGroup(prev, tab, id)))
  }
  const selectTab = (id: string) => {
    setTabId(id)
    openGroup(id, resolveGroup(id, remembered[id]))
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, id)
    } catch {
      // The toolbar still works when browser storage is unavailable.
    }
  }
  const pickTool = (picked: SandboxTool) => {
    if (armedToolId === picked.id) return onClearArmed()
    // The dice roll a new random event, at a new spot, every time they are picked.
    let tool = picked
    if (picked.id === 'dice') {
      if (!worldGrid) return
      tool = { ...picked, fire: rollRandomEvent(worldGrid.width, worldGrid.height) }
    }
    if (tool.mode === 'instant') {
      // Instant tools fire straight away; a flash shows the click landed.
      setFlashId(tool.id)
      window.setTimeout(() => setFlashId((id) => (id === tool.id ? null : id)), 450)
      if (isStateActive(tool)) {
        const off: SandboxTool =
          tool.id === 'drought_on'
            ? { ...tool, fire: { cmd: 'drought', active: false } }
            : { ...tool, fire: { cmd: 'weather', kind: 'clear' } }
        return onPick(off)
      }
    }
    onPick(tool)
  }

  // Q to G pick the first ten tools of the open group, the ones on the bar.
  const rowTools = group?.tools ?? []
  const hotkeys = hotkeysFor(rowTools)
  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || typingTarget(event.target)) return
      const tool = toolForHotkey(rowTools, event.key)
      if (!tool) return
      event.preventDefault()
      pickTool(tool)
    }
    window.addEventListener('keydown', onHotkey)
    return () => window.removeEventListener('keydown', onHotkey)
  })

  // The tiles are memoized, so they get one pick function that never changes and calls this render's pick.
  const pickRef = useRef(pickTool)
  useLayoutEffect(() => {
    pickRef.current = pickTool
  })
  const pickStable = useCallback((tool: SandboxTool) => pickRef.current(tool), [])

  const armedTool = armedToolId ? ALL_TOOLS.find((t) => t.id === armedToolId) : undefined
  const heldName = armedTool ? toolName(armedTool) : (armedToolLabel ?? undefined)

  // The held tool's name sits above its icon; it follows the icon as the row scrolls, stays inside
  // the bar over a tool near either end, and sits at the bar's left end when the tool is in another
  // group or scrolled out of sight. The row also fades at an edge with more tools past it.
  const toolsRef = useRef<HTMLDivElement>(null)
  const heldRef = useRef<HTMLDivElement>(null)
  const [heldX, setHeldX] = useState<number | null>(null)
  const [edges, setEdges] = useState({ before: false, after: false })
  const measureRow = useCallback(() => {
    const bar = barRef.current
    const row = toolsRef.current
    if (!bar || !row) return
    const before = row.scrollLeft > 1
    const after = row.scrollLeft + row.clientWidth < row.scrollWidth - 1
    setEdges((prev) => (prev.before === before && prev.after === after ? prev : { before, after }))
    const tile = armedToolId ? row.querySelector<HTMLElement>(`[data-tool="${armedToolId}"]`) : null
    if (!tile) return setHeldX(null)
    const t = tile.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    const mid = t.left + t.width / 2
    if (mid < r.left || mid > r.right) return setHeldX(null)
    const b = bar.getBoundingClientRect()
    const half = (heldRef.current?.offsetWidth ?? 0) / 2
    setHeldX(Math.round(Math.min(Math.max(mid - b.left, half + 6), b.width - half - 6)))
  }, [armedToolId])
  useLayoutEffect(measureRow, [measureRow, groupId, heldName])
  useEffect(() => {
    const row = toolsRef.current
    if (!row) return
    const obs = new ResizeObserver(measureRow)
    obs.observe(row)
    return () => obs.disconnect()
  }, [measureRow])

  // A remembered group far along its line (on a phone, or between open drawers) is scrolled to.
  const navRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    navRef.current
      ?.querySelectorAll<HTMLElement>('.dock-tab.active, .dock-group-chip.active')
      .forEach(revealInLine)
  }, [tabId, groupId])

  // One tool on the row: a click arms or fires it.
  const renderTile = (tool: SandboxTool) => {
    const active = armedToolId === tool.id || isViewActive(tool) || isStateActive(tool)
    const how = isStateActive(tool)
      ? t('dock.how.happening')
      : active && !tool.view
        ? t('dock.how.stop')
        : `${hotkeys.has(tool.id) ? t('dock.how.press', { key: hotkeys.get(tool.id) ?? '' }) : ''}${toolHowTo(tool, brush)}`
    return (
      <DockTile
        key={tool.id}
        tool={tool}
        active={active}
        flashed={flashId === tool.id}
        hotkey={hotkeys.get(tool.id)}
        body={toolTip(tool)}
        how={how}
        onPick={pickStable}
      />
    )
  }

  return (
    <section className="sandbox-bar" aria-label={t('dock.aria.world')} ref={barRef}>
      {armedToolId && heldName && (
        <div
          ref={heldRef}
          className={clsx('dock-held', heldX === null && 'detached')}
          style={heldX === null ? undefined : { left: heldX }}
          aria-hidden="true"
        >
          {t('dock.held', { name: heldName })}
        </div>
      )}
      <div className="dock-hint" role="status" aria-live="polite">
        {status && <span>{status}</span>}
      </div>

      <div className="dock-nav" ref={navRef}>
        <nav className="dock-tabs" aria-label={t('dock.aria.worldTools')}>
          {DOCK_TABS.map((tab) => (
            <Tooltip
              key={tab.id}
              tip={
                <TipCard
                  title={t(tab.label)}
                  body={t(tab.tip)}
                  how={tabEngaged(tab.id) ? t('dock.how.engaged') : undefined}
                />
              }
            >
              <button
                type="button"
                className={clsx('dock-tab', tab.id === tabId && 'active', tabEngaged(tab.id) && 'engaged')}
                aria-pressed={tab.id === tabId}
                onClick={() => selectTab(tab.id)}
              >
                {t(tab.label)}
                {unseenNewTools(tab.id, seenNew).length > 0 && (
                  <span className="dock-new" aria-label={t('dock.aria.newTools')} />
                )}
              </button>
            </Tooltip>
          ))}
        </nav>
        {groups.length > 1 && (
          <div
            className="dock-groups"
            role="group"
            aria-label={t('dock.aria.groups', { name: tabLabel(tabId) })}
          >
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={clsx(
                  'dock-group-chip',
                  g.id === group?.id && 'active',
                  engaged(g.tools) && 'engaged',
                )}
                aria-pressed={g.id === group?.id}
                onClick={() => openGroup(tabId, g.id)}
              >
                {groupLabel(g)}
                {unseenNewToolsInGroup(g.id, seenNew).length > 0 && (
                  <span className="dock-new" aria-label={t('dock.aria.newTools')} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="dock-row">
        <div
          className={clsx('dock-tools', edges.before && 'more-before', edges.after && 'more-after')}
          role="group"
          aria-label={t('dock.aria.tools', { name: group ? groupLabel(group) : tabLabel(tabId) })}
          ref={toolsRef}
          onScroll={measureRow}
          onWheel={(e) => {
            // A mouse wheel scrolls the row sideways when it overflows.
            const el = e.currentTarget
            if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX))
              el.scrollLeft += e.deltaY
          }}
        >
          {rowTools.map(renderTile)}
        </div>
        {usesBrush(armedTool) && (
          <div
            className="dock-brush"
            role="group"
            aria-label={t('dock.aria.brushSizes')}
            title={t('dock.aria.brushTitle')}
          >
            <button
              type="button"
              aria-label={t('dock.aria.smallerBrush')}
              onClick={() => onBrush(Math.max(0, brush - 1))}
            >
              −
            </button>
            {BRUSH_SIZES.map(([size, value]) => (
              <button
                key={size}
                type="button"
                title={t('dock.aria.brushTiles', { count: size })}
                aria-label={t('dock.aria.brushSize', { size })}
                aria-pressed={brush === value}
                className={brush === value ? 'active' : undefined}
                onClick={() => onBrush(value)}
              >
                {size}
              </button>
            ))}
            <button
              type="button"
              aria-label={t('dock.aria.largerBrush')}
              onClick={() => onBrush(Math.min(20, brush + 1))}
            >
              +
            </button>
          </div>
        )}
        <TimeControl paused={runtimePaused} speed={runtimeSpeed} onPick={onPick} />
      </div>
    </section>
  )
}
