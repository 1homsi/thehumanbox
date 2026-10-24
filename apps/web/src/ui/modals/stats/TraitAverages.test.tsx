// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../../shared/types'
import { loadLocale } from '../../../i18n'
import { TraitAverages } from './TraitAverages'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(async () => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  await loadLocale('en')
})

describe('TraitAverages', () => {
  it('writes each average with the decimal mark of the active language', async () => {
    await loadLocale('de')
    const traits = {
      curiosity: 0.5,
      fear: 0.5,
      social_tendency: 0.5,
      resilience: 0.5,
      aggression: 0.5,
      memory_strength: 0.5,
    }
    const organisms = [{ traits }] as unknown as WorldState['organisms']
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<TraitAverages organisms={organisms} />))
    const values = [...host.querySelectorAll('.trait-val')].map((el) => el.textContent)
    expect(values).toEqual(['0,50', '0,50', '0,50', '0,50', '0,50', '0,50'])
  })
})
