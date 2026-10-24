// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../../../i18n'
import { WealthGapChart } from './WealthGapChart'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(async () => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  await loadLocale('en')
})

describe('WealthGapChart', () => {
  it('writes a year value with the decimal mark of the active language', async () => {
    await loadLocale('de')
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<WealthGapChart values={[0.35]} />))
    const tip = host.querySelector('title')?.textContent ?? ''
    expect(tip).toMatch(/\(0,35\)$/)
  })
})
