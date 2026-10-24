// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LearningSection } from './character'
import type { OrgDetail } from '../../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function render(detail: Partial<OrgDetail>) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<LearningSection detail={detail as OrgDetail} />))
  return host
}

describe('LearningSection', () => {
  it('lists skills, what they enjoy and avoid, and what deaths taught them', () => {
    const host = render({
      skills: [
        { name: 'fishing', level: 0.7, feeling: 0.2 },
        { name: 'woodcutting', level: 0.1, feeling: -0.6 },
      ],
      lessons: ['water', 'hunger'],
    })
    expect(host.textContent).toContain('enjoys fishing')
    expect(host.textContent).toContain('avoids woodcutting')
    expect(host.textContent).toContain('wary of deep water')
    expect(host.textContent).toContain('eats before hunger comes')
  })

  it('shows lessons even for someone with no skills yet, and skips lessons it does not know', () => {
    const host = render({ skills: [], lessons: ['fire', 'comets'] })
    expect(host.textContent).toContain('keeps clear of fire')
    expect(host.textContent).not.toContain('comets')
  })

  it('shows nothing for someone with nothing to tell', () => {
    const host = render({ skills: [], lessons: [] })
    expect(host.textContent).toBe('')
  })
})
