// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SimEvent } from '../../shared/types'
import { formatNumber } from '../../i18n'
import { EventRow } from './EventRow'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('EventRow', () => {
  it('writes the tick with the same grouping as the header clock', () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const event = { tick: 12345, type: 'birth', actor: 'Ari', detail: 'was born' } as unknown as SimEvent
    act(() => root?.render(<EventRow event={event} />))
    expect(host.querySelector('.event-tick')?.textContent).toBe(formatNumber(12345))
  })
})
