// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TribeReasoning } from './TribeReasoning'
import { t } from '../../i18n'
import type { TribeStatus } from '../../game/model/tribe-status'
import type { WorldState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

const status = (over: Partial<TribeStatus> = {}): TribeStatus =>
  ({
    id: 'a',
    name: 'Ash',
    food: 0.9,
    water: 0.9,
    health: 0.9,
    people: 3,
    nextAge: null,
    ...over,
  }) as TribeStatus

function render(w: WorldState, s: TribeStatus): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<TribeReasoning world={w} status={s} />))
  return host
}

describe('TribeReasoning', () => {
  it('says what the tribe needs most, what its people do and what it tries next', () => {
    const host = render(
      {
        tick: 10,
        organisms: [],
        lineage_names: { a: 'Ash', b: 'Bren' },
        tribal_relations: [{ a: 'a', b: 'b', attitude: -0.8, status: 'rivals' }],
        tribe_work: { a: { fishing: 2 } },
        lineage_strategies: {},
      } as unknown as WorldState,
      status({ water: 0.1 }),
    )
    const text = host.textContent ?? ''
    expect(text).toContain(t('panels.tribe.why.title'))
    expect(text).toContain(t('panels.tribe.why.unguided'))
    expect(text).toContain(t('panels.tribe.why.need', { need: t('panels.tribe.why.needs.water'), pct: '90' }))
    expect(text).toContain(t('panels.tribe.why.doing', { list: `${t('panels.tribe.why.work.fishing')} (2)` }))
    expect(text).toContain(t('panels.tribe.why.rivals', { names: 'Bren' }))
    expect(text).toContain(t('panels.tribe.why.next', { step: t('panels.tribe.why.step.water') }))
  })

  it('reports a guided campaign and an idle, quiet tribe when nothing presses', () => {
    const host = render(
      {
        tick: 10,
        organisms: [],
        lineage_names: { a: 'Ash' },
        tribal_relations: [],
        tribe_work: {},
        lineage_strategies: { a: { strategy: 'hunt', expires_tick: 99, progress: 3, target: 12 } },
      } as unknown as WorldState,
      status(),
    )
    const text = host.textContent ?? ''
    expect(text).toContain(t('panels.tribe.why.needNone'))
    expect(text).toContain(t('panels.tribe.why.idle'))
    expect(text).toContain(t('panels.tribe.why.stanceNone'))
    expect(text).toContain(
      t('panels.tribe.why.guided', {
        strategy: t('dialogs.civ.guidance.hunt.label'),
        done: '3',
        target: '12',
      }),
    )
  })
})
