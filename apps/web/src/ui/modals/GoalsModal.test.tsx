// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalsModal } from './GoalsModal'
import { sendSandboxCommand } from '../../simulation/commandBus'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'

vi.mock('../../simulation/commandBus', () => ({ sendSandboxCommand: vi.fn() }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
beforeEach(() => vi.mocked(sendSandboxCommand).mockReset())
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

function renderGoals(): void {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const world = { goals: [], difficulty: 'normal', lost_tick: null } as unknown as WorldState
  act(() => root?.render(<GoalsModal world={world} onClose={() => undefined} />))
}

/** Clicks the difficulty button for a level and lets the world's answer land. */
async function chooseLevel(level: 'calm' | 'normal' | 'harsh') {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === t(`dialogs.goals.levels.${level}`),
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

describe('GoalsModal difficulty', () => {
  it('says so when the world turns the new difficulty down', async () => {
    vi.mocked(sendSandboxCommand).mockResolvedValue(false)
    renderGoals()

    await chooseLevel('harsh')

    expect(sendSandboxCommand).toHaveBeenCalledWith({ cmd: 'set_difficulty', level: 'harsh' })
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe(t('dialogs.goals.difficultyRefused'))
  })

  it('stays quiet when the world accepts the change', async () => {
    vi.mocked(sendSandboxCommand).mockResolvedValue(true)
    renderGoals()

    await chooseLevel('calm')

    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
