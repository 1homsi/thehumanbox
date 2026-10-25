// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SceneContext } from '../core/types'
import { loadLocale, t } from '../../../i18n'
import { TavernInterior } from './TavernInterior'

// The room's canvas needs a 2D context that happy-dom does not have; the header and chips are what is tested.
vi.mock('../shared/RoomCanvas', () => ({ RoomCanvas: () => null }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(async () => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  await loadLocale('en')
})

function render(ctx: Record<string, unknown>): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root?.render(
      <TavernInterior
        ctx={ctx as unknown as SceneContext}
        onExit={() => undefined}
        onFocusOrg={() => undefined}
      />,
    ),
  )
  return host
}

describe('TavernInterior in another language', () => {
  it('words its header and its away chips in the active language', async () => {
    await loadLocale('de')
    const host = render({
      title: 'Taverne',
      subtitle: '',
      occupants: [],
      away: [{ role: 'patron', org: { id: 'a', name: 'Ari' }, activity: 'wartet' }],
      isDay: true,
    })
    expect(host.querySelector('.scene-back')?.getAttribute('aria-label')).toBe(t('common.backToMap'))
    expect(host.querySelector('.scene-meta')?.textContent).toBe(
      `${t('panels.scene.emptyTavern')} · ☀ ${t('panels.scene.day')}`,
    )
    const chip = host.querySelector('.scene-occupant-chip--away')
    expect(chip?.getAttribute('title')).toBe(t('panels.scene.tavernAway'))
    expect(chip?.querySelector('.scene-occupant-role')?.textContent).toBe(
      `Stammgast · ${t('panels.scene.nearby')}`,
    )
  })

  it('counts the drinkers in the active language', async () => {
    await loadLocale('de')
    const occupant = { role: 'guest', org: { id: 'b', name: 'Bea' }, activity: 'trinkt' }
    const host = render({ title: 'Taverne', subtitle: '', occupants: [occupant], away: [], isDay: false })
    expect(host.querySelector('.scene-meta')?.textContent).toBe(
      `${t('panels.scene.drinkingCount', { count: '1' })} · ☾ ${t('panels.scene.night')}`,
    )
  })

  // One drinker takes the singular verb in German, so the wording agrees with the count.
  it('uses the singular verb for one drinker and the plural for two', async () => {
    await loadLocale('de')
    const occupant = { role: 'guest', org: { id: 'b', name: 'Bea' }, activity: 'trinkt' }
    const one = render({ title: 'Taverne', subtitle: '', occupants: [occupant], away: [], isDay: true })
    expect(one.querySelector('.scene-meta')?.textContent).toContain('1 trinkt ')
    act(() => root?.unmount())
    document.body.replaceChildren()
    const two = render({
      title: 'Taverne',
      subtitle: '',
      occupants: [occupant, occupant],
      away: [],
      isDay: true,
    })
    expect(two.querySelector('.scene-meta')?.textContent).toContain('2 trinken ')
  })
})
