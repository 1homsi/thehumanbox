// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TribeHistory } from './TribeHistory'
import { useCameraFocus } from '../../state/camera-focus'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  useCameraFocus.setState({ request: null })
})

function render(world: WorldState): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<TribeHistory world={world} lineage="a" />))
  return host
}

describe('TribeHistory', () => {
  it('lists the newest lines, and a line with a place takes the camera there when clicked', () => {
    const host = render({
      tick: 9000,
      lineage_names: { a: 'Ash', b: 'Bren' },
      tribe_chronicle: {
        a: [
          { tick: 100, kind: 'famine', other: null, word: null, x: 3, y: 4 },
          { tick: 500, kind: 'war', other: 'b', word: null, x: 10, y: 20 },
          { tick: 700, kind: 'split', other: 'b', word: null, x: null, y: null },
        ],
      },
    } as unknown as WorldState)

    const items = [...host.querySelectorAll('li')].map((li) => li.textContent ?? '')
    expect(items[0]).toContain(t('panels.tribe.history.split', { other: 'Bren' }))
    expect(items[1]).toContain(t('panels.tribe.history.war', { other: 'Bren' }))
    expect(items[2]).toContain(t('panels.tribe.history.famine'))

    const buttons = [...host.querySelectorAll('button.tribe-history-go')]
    expect(buttons).toHaveLength(2)
    expect(host.querySelectorAll('.tribe-history-plain')).toHaveLength(1)

    const famine = buttons[1] as HTMLButtonElement
    act(() => famine.click())
    expect(useCameraFocus.getState().request).toMatchObject({ x: 3, y: 4 })
  })

  it('says so when a tribe has no history yet', () => {
    const host = render({ tick: 1, lineage_names: {}, tribe_chronicle: {} } as unknown as WorldState)
    expect(host.textContent).toContain(t('panels.tribe.history.empty'))
  })
})
