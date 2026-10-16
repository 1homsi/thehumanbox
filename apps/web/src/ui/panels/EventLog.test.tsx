// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EventLog } from './EventLog'
import { useWorldStore } from '../../state/worldStore'
import type { SimEvent, WorldState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  useWorldStore.setState({ world: null, byId: new Map() })
})

function ev(tick: number): SimEvent {
  return { tick, type: 'born', actor: 'A', detail: `event ${tick}`, news: true }
}

function world(events: SimEvent[]): WorldState {
  return { tick: events.at(-1)?.tick ?? 0, events, organisms: [], lineage_names: {} } as unknown as WorldState
}

describe('EventLog', () => {
  it('keeps the focused event row mounted when a newer event arrives', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => useWorldStore.getState().setWorld(world([ev(1), ev(2), ev(3)])))
    act(() => root.render(<EventLog />))

    const row = host.querySelector<HTMLElement>('.event-row')!
    act(() => row.focus())
    act(() => useWorldStore.getState().setWorld(world([ev(1), ev(2), ev(3), ev(4)])))

    expect(row.isConnected).toBe(true)
    expect(document.activeElement).toBe(row)
  })
})
