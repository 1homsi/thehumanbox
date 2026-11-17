import { create } from 'zustand'
import { trackEvent } from '../shared/observability'
import { useOpeningGuide } from './opening-guide'
import { readOwnWorldSeed, requestOwnWorldReset } from '../simulation/worldSource'

const STEP_KEY = 'thb-tutorial-step-v1'

export const TUTORIAL_SEED = '42'

export const TUTORIAL_HOME = { x: 313, y: 163 }

export const TUTORIAL_STEPS = [
  { id: 'rain', tool: 'rain' },
  { id: 'food', tool: 'gift_food' },
  { id: 'inspire', tool: 'inspire' },
] as const

export type TutorialSource = 'welcome' | 'settings'

function readStep(): number | null {
  try {
    const raw = window.localStorage.getItem(STEP_KEY)
    if (raw === null || readOwnWorldSeed() !== TUTORIAL_SEED) return null
    const step = Number(raw)
    return Number.isInteger(step) && step >= 0 && step <= TUTORIAL_STEPS.length ? step : null
  } catch {
    return null
  }
}

function writeStep(step: number | null) {
  try {
    if (step === null) window.localStorage.removeItem(STEP_KEY)
    else window.localStorage.setItem(STEP_KEY, String(step))
  } catch {
    return
  }
}

interface TutorialState {
  step: number | null
  begin: (source: TutorialSource) => void
  noteTool: (toolId: string) => void
  leave: () => void
}

export const useTutorial = create<TutorialState>((set, get) => ({
  step: readStep(),
  begin: (source) => {
    writeStep(0)
    trackEvent('tutorial_start', { source }, { send_instantly: true })
    if (!requestOwnWorldReset(TUTORIAL_SEED)) writeStep(null)
  },
  noteTool: (toolId) => {
    const { step } = get()
    if (step === null) return
    const current = TUTORIAL_STEPS[step]
    if (!current || current.tool !== toolId) return
    const next = step + 1
    trackEvent('tutorial_step', { step: current.id, index: next, of: TUTORIAL_STEPS.length })
    writeStep(next)
    set({ step: next })
  },
  leave: () => {
    const { step } = get()
    if (step === null) return
    const completed = step >= TUTORIAL_STEPS.length
    trackEvent(
      'tutorial_finish',
      { completed, step: TUTORIAL_STEPS[step]?.id ?? 'done' },
      { send_instantly: true },
    )
    writeStep(null)
    useOpeningGuide.getState().finish()
    if (!requestOwnWorldReset()) writeStep(step)
  },
}))
