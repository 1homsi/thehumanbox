import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { typingTarget } from '../../game/model/shortcuts'
import type { SandboxTool } from '../../simulation/sandbox'
import { WASM_BASE_TICK_MS } from '../../simulation/runtimeControls'
import { formatSpeed, nextSpeedStep } from '../../simulation/speedSteps'
import { useWorldStore } from '../../state/worldStore'
import { t } from '../../i18n'
import { speedTools } from './dock-tabs'
import { ToolSprite } from './ToolSprite'
import { Tooltip } from './Tooltip'

/** A word beside the odd speeds in the list; the rest speak for themselves. */
function speedNote(mult: number): string | undefined {
  if (mult < 1) return t('dock.time.slowNote')
  if (mult === 1) return t('dock.time.normalNote')
  if (mult >= 500) return t('dock.time.flatOutNote')
  return undefined
}

/** Keys that step the speed. `[` and `]` already walk through people, so these sit beside them. */
const SLOWER_KEY = ','
const FASTER_KEY = '.'

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

function Tip({ title, body, how }: { title: string; body?: string; how?: string }) {
  return (
    <span className="tip-card">
      <span className="tip-title">{title}</span>
      {body && <span className="tip-body">{body}</span>}
      {how && <span className="tip-how">{how}</span>}
    </span>
  )
}

const speedTool = (mult: number, direction: 1 | -1): SandboxTool => ({
  id: `speed-${direction > 0 ? 'faster' : 'slower'}`,
  label: formatSpeed(mult),
  icon: direction > 0 ? '⏩' : '🐢',
  mode: 'instant',
  time: { control: 'speed', mult },
})

interface Props {
  paused: boolean
  speed: number
  onPick: (tool: SandboxTool) => void
}

/**
 * The bar's one time control: pause or play, then the speed with an arrow either side that steps
 * it. The speed itself opens the list of every speed.
 */
export function TimeControl({ paused, speed, onPick }: Props) {
  const [listOpen, setListOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const achieved = useAchievedSpeed(paused)
  // Past what the machine can sustain, say what it is really doing.
  const lagging = !paused && achieved !== null && speed > 10 && achieved < speed * 0.8
  const slower = nextSpeedStep(speed, -1)
  const faster = nextSpeedStep(speed, 1)

  const togglePause = () =>
    onPick({
      id: paused ? 'play' : 'pause',
      label: paused ? t('dock.time.play') : t('dock.time.pause'),
      icon: paused ? '▶️' : '⏸️',
      mode: 'instant',
      time: { control: paused ? 'resume' : 'pause' },
    })
  const step = (direction: 1 | -1) => {
    const next = direction > 0 ? faster : slower
    if (next !== null) onPick(speedTool(next, direction))
  }

  // The step keys read this render's speed, so the listener is renewed each render.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typingTarget(event.target)) return
      if (event.key !== SLOWER_KEY && event.key !== FASTER_KEY) return
      event.preventDefault()
      step(event.key === FASTER_KEY ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The list closes on a click anywhere else, or on Escape.
  useEffect(() => {
    if (!listOpen) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setListOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setListOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [listOpen])

  const lagNote = lagging
    ? t('dock.time.lag', {
        asked: formatSpeed(speed),
        actual: formatSpeed(Math.round(achieved ?? 0)),
      })
    : undefined

  return (
    <div className={clsx('time-control', paused && 'paused', lagging && 'lagging')} ref={root}>
      <Tooltip
        tip={
          <Tip
            title={paused ? t('dock.time.resume') : t('dock.time.pause')}
            body={paused ? t('dock.time.resumeTip') : t('dock.time.pauseTip', { speed: formatSpeed(speed) })}
            how="space"
          />
        }
      >
        <button
          type="button"
          className="time-pause"
          onClick={togglePause}
          aria-label={paused ? t('dock.time.resumeAria') : t('dock.time.pauseAria')}
        >
          <ToolSprite icon={paused ? '▶️' : '⏸️'} size={18} />
        </button>
      </Tooltip>
      <Tooltip
        tip={
          <Tip
            title={
              slower === null
                ? t('dock.time.slower')
                : t('dock.time.slowerTo', { speed: formatSpeed(slower) })
            }
            body={slower === null ? t('dock.time.slowest') : undefined}
            how={SLOWER_KEY}
          />
        }
      >
        <button
          type="button"
          className="time-step"
          aria-label={t('dock.time.slower')}
          aria-keyshortcuts={SLOWER_KEY}
          disabled={slower === null}
          onClick={() => step(-1)}
        >
          ‹
        </button>
      </Tooltip>
      <Tooltip
        tip={
          <Tip
            title={
              paused
                ? t('dock.time.pausedAt', { speed: formatSpeed(speed) })
                : t('dock.time.speedAt', { speed: formatSpeed(speed) })
            }
            body={lagNote ?? t('dock.time.chooseAny')}
          />
        }
      >
        <button
          type="button"
          className="time-speed-value"
          aria-label={t('dock.time.speedAria', { speed: formatSpeed(speed) })}
          aria-haspopup="menu"
          aria-expanded={listOpen}
          onClick={() => setListOpen((open) => !open)}
        >
          {formatSpeed(speed)}
          {lagging && <span className="time-lag" aria-hidden="true" />}
        </button>
      </Tooltip>
      <Tooltip
        tip={
          <Tip
            title={
              faster === null
                ? t('dock.time.faster')
                : t('dock.time.fasterTo', { speed: formatSpeed(faster) })
            }
            body={faster === null ? t('dock.time.fastest') : undefined}
            how={FASTER_KEY}
          />
        }
      >
        <button
          type="button"
          className="time-step"
          aria-label={t('dock.time.faster')}
          aria-keyshortcuts={FASTER_KEY}
          disabled={faster === null}
          onClick={() => step(1)}
        >
          ›
        </button>
      </Tooltip>
      {listOpen && (
        <div className="time-speed-list" role="menu" aria-label={t('dock.time.speedsAria')}>
          {speedTools().map((tool) => {
            const mult = tool.time?.mult ?? 1
            const on = Math.abs(mult - speed) < 1e-6
            const note = speedNote(mult)
            return (
              <button
                key={tool.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                aria-label={t('dock.time.speedItemAria', { speed: formatSpeed(mult) })}
                className={clsx(on && 'active')}
                onClick={() => {
                  onPick(tool)
                  setListOpen(false)
                }}
              >
                <span>{formatSpeed(mult)}</span>
                {note && <small>{note}</small>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
