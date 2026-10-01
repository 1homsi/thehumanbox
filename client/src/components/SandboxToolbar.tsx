import { WorldToolSearch } from './WorldToolSearch'
import { ToolSprite } from './ToolSprite'
import { Tooltip } from './Tooltip'
import { toolHowTo, toolTip } from './tool-tips'
import { useEffect, useRef, useState } from 'react'
import { useWorldStore } from '../stores/worldStore'
import clsx from 'clsx'
import {
  SANDBOX_CATEGORIES,
  isSandboxViewControlActive,
  type SandboxTool,
  type SandboxViewFlag,
} from '../simulation/sandbox'
import { DOCK_TABS, SPEED_TOOL_IDS, TIME_CATEGORY_ID, groupsFor, resolveTab } from './dock-tabs'
import { WASM_BASE_TICK_MS } from '../simulation/runtimeControls'

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
  onSave?: () => void
  saveStatus?: string
  saveBusy?: boolean
  saveError?: boolean
  saveRetryable?: boolean
}

function formatSpeed(speed: number): string {
  return `${Number.isInteger(speed) ? speed.toFixed(0) : speed}×`
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

/**
 * Speed the world is really running at, from how fast its tick advances
 * (1× is one tick per base interval). Null until there are samples.
 */
function useAchievedSpeed(paused: boolean): number | null {
  const tick = useWorldStore((s) => s.world?.tick ?? 0)
  const samples = useRef<[number, number][]>([])
  const [speed, setSpeed] = useState<number | null>(null)
  useEffect(() => {
    if (paused) {
      samples.current = []
      return
    }
    const now = performance.now()
    const list = samples.current
    list.push([now, tick])
    while (list.length > 2 && now - list[0][0] > 3000) list.shift()
    const [t0, k0] = list[0]
    if (now - t0 >= 1000 && tick > k0) {
      setSpeed(((tick - k0) / ((now - t0) / 1000)) * (WASM_BASE_TICK_MS / 1000))
    }
  }, [tick, paused])
  return speed
}

export function SandboxToolbar({
  armedToolId,
  brush,
  status,
  runtimePaused = false,
  runtimeSpeed = 1,
  activeOverlay = null,
  activeViewFlags = {},
  onBrush,
  onPick,
  onClearArmed,
  onSave,
  saveStatus,
  saveBusy = false,
  saveError = false,
  saveRetryable = false,
}: Props) {
  const [tabId, setTabId] = useState(readInitialTab)
  const groups = groupsFor(tabId)
  const timeTools = SANDBOX_CATEGORIES.find((c) => c.id === TIME_CATEGORY_ID)?.tools ?? []
  const speedTools = SPEED_TOOL_IDS.flatMap((id) => timeTools.filter((t) => t.id === id))
  const achieved = useAchievedSpeed(runtimePaused)
  // Past what the machine can sustain, say what it is really doing.
  const lagging = !runtimePaused && achieved !== null && runtimeSpeed > 10 && achieved < runtimeSpeed * 0.8
  // The runtime rounds a request to a rate it can batch (5000x becomes
  // ~1920x), so light whichever button is closest on a log scale.
  const activeSpeedId = speedTools.reduce<{ id: string | null; d: number }>(
    (best, t) => {
      const d = Math.abs(Math.log((t.time?.mult ?? 1) / Math.max(runtimeSpeed, 0.01)))
      return d < best.d ? { id: t.id, d } : best
    },
    { id: null, d: Infinity },
  ).id
  const weather = useWorldStore((s) => s.world?.weather?.kind)
  const drought = useWorldStore((s) => s.world?.drought ?? false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const isViewActive = (tool: SandboxTool) =>
    isSandboxViewControlActive(tool.view, activeOverlay, activeViewFlags)
  // Weather and drought are states of the world, so their tiles light up
  // while that state holds, and clicking a lit one switches it off.
  const isStateActive = (tool: SandboxTool) =>
    (tool.id === 'rain' && weather === 'rain') ||
    (tool.id === 'storm' && weather === 'storm') ||
    (tool.id === 'drought_on' && drought)
  const tabEngaged = (id: string) =>
    groupsFor(id).some((c) => c.tools.some((t) => armedToolId === t.id || isViewActive(t)))

  const toggleTime = () =>
    onPick({
      id: runtimePaused ? 'play' : 'pause',
      label: runtimePaused ? 'play' : 'pause',
      icon: runtimePaused ? '▶️' : '⏸️',
      mode: 'instant',
      time: { control: runtimePaused ? 'resume' : 'pause' },
    })
  const selectTab = (id: string) => {
    setTabId(id)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, id)
    } catch {
      // The toolbar still works when browser storage is unavailable.
    }
  }
  const pickTool = (tool: SandboxTool) => {
    if (armedToolId === tool.id) return onClearArmed()
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

  // Tooltips describe tools and the world view explains the armed one, so
  // the hint line only carries transient status and the brush size.
  const hint = status ?? null
  const saveActionLabel = saveBusy ? 'saving' : saveError && saveRetryable ? '↻ retry save' : 'save world'
  const saveTitle = saveStatus
    ? `${saveActionLabel} · ${saveStatus}`
    : saveError && saveRetryable
      ? 'Retry saving this world on this device'
      : saveBusy
        ? 'Saving this world on this device'
        : 'Save this world on this device now'

  return (
    <section className="sandbox-bar" aria-label="World controls">
      <nav className="dock-tabs" aria-label="World tools">
        {DOCK_TABS.map((tab) => (
          <Tooltip
            key={tab.id}
            tip={
              <TipCard
                title={tab.label}
                body={tab.tip}
                how={tabEngaged(tab.id) ? 'a tool or layer here is on' : undefined}
              />
            }
          >
            <button
              type="button"
              className={clsx('dock-tab', tab.id === tabId && 'active', tabEngaged(tab.id) && 'engaged')}
              aria-pressed={tab.id === tabId}
              onClick={() => selectTab(tab.id)}
            >
              <ToolSprite icon={tab.icon} size={24} />
              <span>{tab.label}</span>
            </button>
          </Tooltip>
        ))}
      </nav>

      <div className="dock-hint" role="status" aria-live="polite">
        {hint && <span>{hint}</span>}
        {armedToolId && (
          <span className="dock-brush" title="Brush size · also [ and ]">
            <button type="button" aria-label="Smaller brush" onClick={() => onBrush(Math.max(0, brush - 1))}>
              −
            </button>
            <span>brush {brush}</span>
            <button type="button" aria-label="Larger brush" onClick={() => onBrush(Math.min(20, brush + 1))}>
              +
            </button>
          </span>
        )}
      </div>

      <div
        className="dock-tools"
        role="group"
        aria-label={`${tabId} tools`}
        onWheel={(e) => {
          // A mouse wheel scrolls the tool strip sideways when it overflows.
          const el = e.currentTarget
          if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX))
            el.scrollLeft += e.deltaY
        }}
      >
        {groups.map((group) => (
          <div className="dock-group" key={group.id} role="group" aria-label={group.label}>
            {group.tools.map((tool) => {
              const active = armedToolId === tool.id || isViewActive(tool) || isStateActive(tool)
              return (
                <Tooltip
                  key={tool.id}
                  tip={
                    <TipCard
                      title={tool.label}
                      body={toolTip(tool)}
                      how={
                        isStateActive(tool)
                          ? 'happening now · click again to end it'
                          : active && !tool.view
                            ? 'click again or press esc to stop'
                            : toolHowTo(tool)
                      }
                    />
                  }
                >
                  <button
                    type="button"
                    className={clsx('dock-tile', active && 'active', flashId === tool.id && 'flash')}
                    aria-label={tool.label}
                    aria-pressed={active}
                    onClick={() => pickTool(tool)}
                  >
                    <ToolSprite icon={tool.icon} size={36} />
                  </button>
                </Tooltip>
              )
            })}
          </div>
        ))}
      </div>

      <div className="dock-side">
        <div className="dock-time">
          <Tooltip
            tip={
              <TipCard
                title={runtimePaused ? 'resume' : 'pause'}
                body={
                  runtimePaused
                    ? 'Time is stopped. Start the world again.'
                    : lagging
                      ? `Asked for ${formatSpeed(runtimeSpeed)}; this computer is running about ${formatSpeed(Math.round(achieved ?? 0))}, as fast as it can.`
                      : `Stop time. Running at ${formatSpeed(runtimeSpeed)}.`
                }
                how="space"
              />
            }
          >
            <button
              type="button"
              className={clsx('dock-play', runtimePaused && 'paused')}
              onClick={toggleTime}
              aria-label={runtimePaused ? 'Resume simulation' : 'Pause simulation'}
            >
              <ToolSprite icon={runtimePaused ? '▶️' : '⏸️'} size={24} />
              <span>
                {runtimePaused
                  ? 'paused'
                  : lagging
                    ? `≈${formatSpeed(Math.round(achieved ?? 0))}`
                    : formatSpeed(runtimeSpeed)}
              </span>
            </button>
          </Tooltip>
          <div className="dock-speeds">
            {speedTools.map((tool) => (
              <Tooltip
                key={tool.id}
                tip={
                  <TipCard
                    title={`speed ${formatSpeed(tool.time?.mult ?? 1)}`}
                    body={
                      tool.label === '1×'
                        ? 'Normal speed.'
                        : (tool.time?.mult ?? 1) > 40
                          ? `Run time ${formatSpeed(tool.time?.mult ?? 1)} faster, or as fast as this computer can.`
                          : `Run time ${tool.label} faster.`
                    }
                  />
                }
              >
                <button
                  type="button"
                  className={clsx('dock-speed', !runtimePaused && tool.id === activeSpeedId && 'active')}
                  onClick={() => onPick(tool)}
                  aria-label={`Speed ${tool.label}`}
                >
                  {tool.label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
        <div className="dock-utility">
          <WorldToolSearch onPick={onPick} />
          {onSave && (
            <Tooltip tip={<TipCard title={saveActionLabel} body={saveTitle} />}>
              <div className={clsx('sandbox-save', saveError && 'error')}>
                <button
                  type="button"
                  className={clsx('dock-mini', 'sandbox-save-button', saveBusy && 'busy')}
                  onClick={onSave}
                  disabled={saveBusy || (saveError && !saveRetryable)}
                  aria-label={saveActionLabel}
                  aria-busy={saveBusy}
                >
                  <span className="sandbox-save-icon" aria-hidden="true">
                    <ToolSprite icon="💾" size={24} />
                  </span>
                  <span className="sandbox-save-label">
                    {saveBusy ? 'saving' : saveError && saveRetryable ? 'retry save' : 'save world'}
                  </span>
                </button>
                {saveStatus && (
                  <span className="sandbox-save-status" role="status">
                    {saveStatus}
                  </span>
                )}
              </div>
            </Tooltip>
          )}
        </div>
      </div>
    </section>
  )
}
