// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FollowTribe } from './FollowTribe'
import { useTribeFollow } from '../../state/tribe-follow'
import { t } from '../../i18n'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  useTribeFollow.setState({ followed: [], warnFollowedOnly: false })
})

describe('FollowTribe', () => {
  it('toggles following a tribe, and says so on the button', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<FollowTribe lineage="a" />))

    const button = host.querySelector('button') as HTMLButtonElement
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe(t('panels.tribe.follow'))

    act(() => button.click())
    expect(useTribeFollow.getState().followed).toEqual(['a'])
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe(t('panels.tribe.unfollow'))

    act(() => button.click())
    expect(useTribeFollow.getState().followed).toEqual([])
  })
})
