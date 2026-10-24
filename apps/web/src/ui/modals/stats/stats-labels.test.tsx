// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../../shared/types'
import { loadLocale, t } from '../../../i18n'
import { AgePyramid } from './AgePyramid'
import { BondStats } from './BondStats'
import { DiscoveryRollup } from './DiscoveryRollup'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(async () => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  await loadLocale('en')
})

type Organisms = WorldState['organisms']

function mount(node: React.ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(node))
  return host
}

describe('stats labels in another language', () => {
  it('names the age groups of the pyramid in the active language', async () => {
    await loadLocale('de')
    const organisms = [
      { sex: 'male', age: 4000, is_elder: true },
      { sex: 'female', age: 1500 },
      { sex: 'male', age: 100 },
    ] as unknown as Organisms
    const host = mount(<AgePyramid organisms={organisms} />)
    const labels = [...host.querySelectorAll('.age-label')].map((el) => el.textContent)
    expect(labels).toEqual([t('dialogs.life.elder'), t('dialogs.stats.ageAdult'), t('person.kin.child')])
    expect(labels).not.toContain('adult')
  })

  it('names the bond counts in the active language', async () => {
    await loadLocale('de')
    const host = mount(<BondStats organisms={[] as unknown as Organisms} />)
    const labels = [...host.querySelectorAll('.hist-label')].map((el) => el.textContent)
    expect(labels).toEqual([
      t('dialogs.life.partnered'),
      t('dock.more.pregnant'),
      t('dialogs.stats.withKids'),
      t('person.card.sick'),
      t('dock.more.hungry'),
      t('dialogs.stats.thirsty'),
    ])
  })

  it('words the discovery rollup in the active language', async () => {
    await loadLocale('de')
    const names = Array.from({ length: 20 }, (_, i) => `discovery_${i}`)
    const organisms = names.map((name) => ({ discoveries: [name] })) as unknown as Organisms
    const host = mount(<DiscoveryRollup organisms={organisms} />)
    expect(host.querySelector('.disc-summary > span')?.textContent).toBe(
      t('dialogs.stats.distinctShown', { total: '20', shown: '18' }),
    )
    expect(host.querySelector('.disc-toggle')?.textContent).toBe(
      t('dialogs.civ.history.showAll', { count: '20' }),
    )
  })

  it('says there are no discoveries in the active language', async () => {
    await loadLocale('de')
    const host = mount(<DiscoveryRollup organisms={[] as unknown as Organisms} />)
    expect(host.textContent).toBe(t('dialogs.stats.noDiscoveries'))
  })
})
