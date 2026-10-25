// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RelationsTable } from './RelationsTable'
import { t } from '../../../i18n'
import { useWorldStore } from '../../../state/worldStore'
import type { WorldState } from '../../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

function mount(node: React.ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(node))
  return host
}

describe('RelationsTable names', () => {
  it('names a tribe that has died out by the name it had while it lived', () => {
    // The snapshot the player saw while the tribe was alive.
    useWorldStore.getState().setWorld({
      tick: 10,
      organisms: [],
      lineage_names: { 'ash-line': 'Ashfolk' },
    } as unknown as WorldState)
    // The simulation has since dropped the name, so the lookup is empty.
    const host = mount(
      <RelationsTable
        relations={[{ a: 'ash-line', b: 'bren-line', attitude: 0.5, status: 'ally' }]}
        lineageSizes={[]}
        lineageNames={{ 'bren-line': 'Bren' }}
      />,
    )

    const names = [...host.querySelectorAll('.stats-rel-name')].map((el) => el.textContent)
    expect(names).toEqual(['Ashfolk', 'Bren'])
  })

  it('shows a short form of an id it has never had a name for, as the other lists do', () => {
    const host = mount(
      <RelationsTable
        relations={[{ a: 'nameless-tribe-id', b: 'bren-line', attitude: -0.5, status: 'rivals' }]}
        lineageSizes={[]}
        lineageNames={{ 'bren-line': 'Bren' }}
      />,
    )

    const first = host.querySelector('.stats-rel-name')?.textContent
    expect(first).toBe('nameless-tribe-id'.slice(0, 6))
  })

  it('counts a tribe that is no longer in the sizes as no people, not as a question mark', () => {
    const host = mount(
      <RelationsTable
        relations={[{ a: 'gone-line', b: 'bren-line', attitude: 0.2, status: 'neutral' }]}
        lineageSizes={[{ id: 'bren-line', count: 7 }]}
        lineageNames={{ 'bren-line': 'Bren' }}
      />,
    )

    const versus = host.querySelector('.stats-rel-muted:last-child')?.textContent ?? ''
    expect(versus).toBe(t('dialogs.stats.versus', { a: 0, b: 7 }))
    expect(versus).not.toContain('?')
  })
})
