// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../shared/types'
import { WorldSilent } from './WorldSilent'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

/** A world whose last person has died: nobody alive, but people once lived here. */
function silentWorld(answered: number, tribes: number): WorldState {
  const lineage_names = Object.fromEntries(Array.from({ length: tribes }, (_, i) => [`L${i}`, `Tribe ${i}`]))
  return {
    tick: 90000,
    organisms: [],
    pop_history: [[0, 200]],
    lineage_names,
    faith: { by_lineage: {}, answered, forsaken: 0, blessed: [], despairing: [] },
    cosmos: { year: 4 },
  } as unknown as WorldState
}

describe('WorldSilent', () => {
  it('groups a long world’s count of answered prayers and tribes like the rest of the interface', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root?.render(<WorldSilent world={silentWorld(1234, 1500)} onSeed={() => {}} onNewWorld={null} />),
    )
    // The modal is lazy-loaded, so poll until it is on screen.
    await vi.waitFor(() => expect(document.querySelector('.world-silent')).not.toBeNull())
    const stats = document.querySelector('.world-silent-stats')!.textContent ?? ''
    expect(stats).toContain('1,234')
    expect(stats).toContain('1,500')
  })
})
