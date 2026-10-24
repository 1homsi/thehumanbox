// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OrganismState } from '../../../shared/types'
import { formatNumber } from '../../../i18n'
import { GenerationBars } from './GenerationBars'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('GenerationBars', () => {
  it('writes each generation headcount with the same grouping as the rest of the stats', () => {
    const living = Array.from({ length: 1234 }, () => ({ alive: true, generation: 0 })) as OrganismState[]
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<GenerationBars organisms={living} />))
    const counts = [...host.querySelectorAll('span')].map((el) => el.textContent)
    expect(counts).toContain(formatNumber(1234))
    expect(counts).not.toContain('1234')
  })
})
