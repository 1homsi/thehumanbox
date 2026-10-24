// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendSandboxCommand } from '../../simulation/commandBus'
import { useUIStore } from '../../state/store'
import { t } from '../../i18n'
import { RenameForm } from './RenameForm'

vi.mock('../../simulation/commandBus', () => ({ sendSandboxCommand: vi.fn() }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

beforeEach(() => {
  vi.mocked(sendSandboxCommand).mockReset()
  useUIStore.setState({ renamingOrgId: 'p1' })
})

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

function mount(): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<RenameForm org={{ id: 'p1', name: 'Ari' }} />))
  return host
}

function submitName(host: HTMLElement, name: string) {
  const input = host.querySelector<HTMLInputElement>('input')!
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setValue.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('RenameForm', () => {
  it('closes once the world saves the name', async () => {
    vi.mocked(sendSandboxCommand).mockResolvedValue(true)
    const host = mount()
    submitName(host, 'Bea')
    await flush()
    expect(sendSandboxCommand).toHaveBeenCalledWith({ cmd: 'rename_person', id: 'p1', name: 'Bea' })
    expect(useUIStore.getState().renamingOrgId).toBeNull()
  })

  it('stays open and says so when the world refuses the name', async () => {
    vi.mocked(sendSandboxCommand).mockResolvedValue(false)
    const host = mount()
    submitName(host, 'Bea')
    await flush()
    expect(host.querySelector('input')).not.toBeNull()
    expect(useUIStore.getState().renamingOrgId).toBe('p1')
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(t('panels.rename.refused'))
  })
})
