// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../../shared/types'
import { formatNumber } from '../../../i18n'
import { DiscoveryRollup } from './DiscoveryRollup'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('DiscoveryRollup', () => {
  it('writes each discovery count with the same grouping as the rest of the stats', () => {
    const organisms = Array.from({ length: 1500 }, () => ({
      discoveries: ['fire'],
    })) as unknown as WorldState['organisms']
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<DiscoveryRollup organisms={organisms} />))
    const counts = [...host.querySelectorAll('.disc-count')].map((el) => el.textContent)
    expect(counts).toEqual([formatNumber(1500)])
  })
})
