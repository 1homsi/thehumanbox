// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PopChart } from './PopChart'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function render(history: [number, number][]): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<PopChart history={history} />))
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('no chart drawn')
  return svg as unknown as HTMLElement
}

/** The y-axis labels: the numbers drawn at the left edge of the chart. */
function yAxisLabels(svg: Element): string[] {
  return [...svg.querySelectorAll('text')]
    .filter((text) => text.getAttribute('text-anchor') === 'end')
    .map((text) => text.textContent ?? '')
}

describe('PopChart axis', () => {
  it('draws a finite axis when the whole history is empty (a world that died out)', () => {
    const svg = render([
      [0, 0],
      [300, 0],
      [600, 0],
    ])
    expect(svg.outerHTML).not.toContain('NaN')
    expect(yAxisLabels(svg)).toEqual(['0', '1'])
  })

  it('does not repeat a tick label when the peak is 1', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const svg = render([
      [0, 1],
      [300, 0],
      [600, 1],
    ])
    expect(yAxisLabels(svg)).toEqual(['0', '1'])
    expect(error.mock.calls.flat().join(' ')).not.toContain('same key')
  })

  it('keeps the usual 0, half and peak labels for a growing population', () => {
    const svg = render([
      [0, 10],
      [300, 20],
      [600, 40],
    ])
    expect(yAxisLabels(svg)).toEqual(['0', '20', '40'])
  })
})
