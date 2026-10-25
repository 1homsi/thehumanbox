// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../../../i18n'
import type { WorldState } from '../../../shared/types'
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

function render(organisms: Array<{ discoveries: string[] }>): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<DiscoveryRollup organisms={organisms as unknown as WorldState['organisms']} />))
  return host
}

describe('DiscoveryRollup names', () => {
  it('names a discovery in the active language, not as its raw id', async () => {
    await loadLocale('de')
    const host = render([
      { discoveries: ['agriculture', 'tomb_preparation'] },
      { discoveries: ['agriculture'] },
    ])
    const names = [...host.querySelectorAll('.disc-name')].map((el) => el.textContent)
    expect(names[0]).toBe('Ackerbau')
  })

  it('still shows a discovery the table does not name as its words', async () => {
    await loadLocale('de')
    const host = render([{ discoveries: ['made_up_discovery'] }])
    expect(host.querySelector('.disc-name')?.textContent).toBe('made up discovery')
  })

  it('keeps English names in English', () => {
    const host = render([{ discoveries: ['agriculture'] }])
    expect(host.querySelector('.disc-name')?.textContent).toBe('agriculture')
  })
})
