import { useEffect, useMemo, useRef } from 'react'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../../simulation/sandbox'
import { tribeStatus } from '../../game/model/tribe-status'
import { useCameraFocus } from '../../state/camera-focus'
import { TUTORIAL_HOME, TUTORIAL_STEPS, useTutorial } from '../../state/tutorial'
import { ToolSprite } from '../toolbar/ToolSprite'
import { toolName } from '../toolbar/tool-tips'
import { FIRST_LOOK_ZOOM } from './FirstLook'

const STEP_TEXT = {
  rain: { ask: 'dialogs.tutorial.rain', armed: 'dialogs.tutorial.rain' },
  food: { ask: 'dialogs.tutorial.food', armed: 'dialogs.tutorial.foodArmed' },
  inspire: { ask: 'dialogs.tutorial.inspire', armed: 'dialogs.tutorial.inspireArmed' },
} as const

function findTool(id: string): SandboxTool | undefined {
  return SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((tool) => tool.id === id)
}

function nearestTribe(world: WorldState): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const o of world.organisms) {
    if (o.alive === false) continue
    const d = (o.x - TUTORIAL_HOME.x) ** 2 + (o.y - TUTORIAL_HOME.y) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = o.lineage_id
    }
  }
  return best
}

function tribeCentre(world: WorldState, tribe: string): { x: number; y: number } | null {
  let x = 0
  let y = 0
  let n = 0
  for (const o of world.organisms) {
    if (o.alive === false || o.lineage_id !== tribe) continue
    x += o.x
    y += o.y
    n++
  }
  return n ? { x: Math.round(x / n), y: Math.round(y / n) } : null
}

interface Props {
  world: WorldState | null
  armedToolId: string | null
  onPickTool: (tool: SandboxTool) => void
}

export function TutorialGuide({ world, armedToolId, onPickTool }: Props) {
  const step = useTutorial((s) => s.step)
  const active = step !== null
  const tribe = useMemo(() => (active && world ? nearestTribe(world) : null), [active, world])
  const name = useMemo(() => (world && tribe ? tribeStatus(world, tribe)?.name : null), [world, tribe])
  const home = world && tribe ? tribeCentre(world, tribe) : null
  const homeX = home?.x ?? null
  const homeY = home?.y ?? null
  const focused = useRef<number | null>(null)

  useEffect(() => {
    if (step === null || homeX === null || homeY === null || focused.current === step) return
    focused.current = step
    useCameraFocus.getState().focusTile(homeX, homeY, FIRST_LOOK_ZOOM)
  }, [step, homeX, homeY])

  if (step === null || !world || !name) return null
  const current = TUTORIAL_STEPS[step]
  const leave = () => useTutorial.getState().leave()

  if (!current) {
    return (
      <div className="opening-caption tutorial-caption" role="status" aria-live="polite">
        <div className="tutorial-text">
          <span className="tutorial-count">{t('dialogs.tutorial.doneTitle')}</span>
          <p key="done" className="opening-line">
            {t('dialogs.tutorial.done', { tribe: name })}
          </p>
        </div>
        <button type="button" className="lang-btn primary tutorial-action" onClick={leave}>
          {t('dialogs.tutorial.realWorld')}
        </button>
      </div>
    )
  }

  const tool = findTool(current.tool)
  const armed = armedToolId === current.tool
  const text = STEP_TEXT[current.id]
  return (
    <div className="opening-caption tutorial-caption" role="status" aria-live="polite">
      <div className="tutorial-text">
        <span className="tutorial-count">
          {t('dialogs.tutorial.count', { step: step + 1, total: TUTORIAL_STEPS.length })}
        </span>
        <p key={`${current.id}-${armed}`} className="opening-line">
          {t(armed ? text.armed : text.ask, { tribe: name, tool: tool ? toolName(tool) : '' })}
        </p>
      </div>
      {tool && !armed && (
        <button type="button" className="lang-btn primary tutorial-action" onClick={() => onPickTool(tool)}>
          <ToolSprite icon={tool.icon} size={16} />
          {toolName(tool)}
        </button>
      )}
      <button type="button" className="lang-btn tutorial-skip" onClick={leave}>
        {t('dialogs.tutorial.leave')}
      </button>
    </div>
  )
}
