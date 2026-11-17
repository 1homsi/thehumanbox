// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { trackEvent } from '../../../shared/observability'
import { DesktopSettingsModal } from '../../../ui/modals/DesktopSettingsModal'
import { useNerdStats, useUIStore } from '../../store'

vi.mock('../../../shared/observability', () => ({ trackEvent: vi.fn() }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
afterEach(() => {
  act(() => useUIStore.getState().setNerdStats(false))
  vi.mocked(trackEvent).mockClear()
  document.body.innerHTML = ''
})

function Probe() {
  return <output>{useNerdStats() ? 'on' : 'off'}</output>
}

it('useNerdStats follows the setting and reports only real changes', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Probe />))
  expect(host.textContent).toBe('off')
  act(() => useUIStore.getState().setNerdStats(true))
  expect(host.textContent).toBe('on')
  act(() => useUIStore.getState().setNerdStats(true))
  expect(trackEvent).toHaveBeenCalledTimes(1)
  expect(trackEvent).toHaveBeenCalledWith('nerd_stats_toggle', { on: true })
  act(() => root.unmount())
})

it('lives at the top of the Display settings with a description', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<DesktopSettingsModal onClose={() => {}} />))
  const displayTab = [...document.querySelectorAll<HTMLButtonElement>('.settings-tab')].find((b) =>
    /display/i.test(b.textContent ?? ''),
  )
  await act(async () => displayTab!.click())
  const firstRow = document.querySelector('.settings-pane .settings-row')!
  expect(firstRow.querySelector('.settings-row-title')?.textContent).toBe('Stats for nerds')
  expect(firstRow.querySelector('.settings-row-desc')?.textContent).toMatch(/raw numbers/)
  const toggle = firstRow.querySelector<HTMLButtonElement>('[role="switch"]')!
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  await act(async () => toggle.click())
  expect(useUIStore.getState().nerdStats).toBe(true)
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect(trackEvent).toHaveBeenCalledWith('nerd_stats_toggle', { on: true })
  act(() => root.unmount())
})
