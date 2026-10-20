// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../state/store'
import { PhoneMenu } from './PhoneMenu'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  useUIStore.setState({ showStats: false, showCiv: false, showOrgSearch: false, showDesktopSettings: false })
})

function mount(props: Partial<React.ComponentProps<typeof PhoneMenu>> = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() =>
    root.render(
      <PhoneMenu chronicleCount={3} isFullscreen={false} onToggleFullscreen={() => {}} {...props} />,
    ),
  )
  return () => {
    act(() => root.unmount())
    container.remove()
  }
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.phone-menu-row')].find((b) => b.textContent?.includes(label))

describe('PhoneMenu', () => {
  it('opens a sheet holding every action the header row hides', () => {
    const unmount = mount()
    expect(document.querySelector('.phone-menu-modal')).toBeNull()
    act(() => document.querySelector<HTMLElement>('.phone-menu-btn')!.click())
    for (const label of [
      'stats',
      'civilization',
      'find people',
      'chronicles',
      'world panel',
      'people panel',
      'settings',
      'about',
    ]) {
      expect(button(label), label).toBeTruthy()
    }
    expect(button('chronicles')!.textContent).toContain('3')
    unmount()
  })

  it('closes the sheet and runs the action', () => {
    const unmount = mount()
    act(() => document.querySelector<HTMLElement>('.phone-menu-btn')!.click())
    act(() => button('stats')!.click())
    expect(useUIStore.getState().showStats).toBe(true)
    expect(document.querySelector('.phone-menu-modal')).toBeNull()
    unmount()
  })

  it('toggles the drawers through the store', () => {
    const unmount = mount()
    const before = useUIStore.getState().leftOpen
    act(() => document.querySelector<HTMLElement>('.phone-menu-btn')!.click())
    act(() => button('world panel')!.click())
    expect(useUIStore.getState().leftOpen).toBe(!before)
    unmount()
  })

  it('carries the view options', () => {
    const unmount = mount()
    act(() => document.querySelector<HTMLElement>('.phone-menu-btn')!.click())
    expect(document.querySelector('.phone-menu-body .more-dropdown')).toBeTruthy()
    unmount()
  })
})
