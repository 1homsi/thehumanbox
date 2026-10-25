// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../../../i18n'
import type { OrganismState } from '../../../shared/types'
import { StatusChips } from './status'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(async () => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  await loadLocale('en')
})

function render(org: Record<string, unknown>): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<StatusChips org={org as unknown as OrganismState} />))
  return host
}

describe('org chips for a life stage and a calling', () => {
  it('shows the life stage and the calling in English', () => {
    const host = render({ age_stage: 'elder', specialty: 'smith', discoveries: [] })
    const text = host.textContent ?? ''
    expect(text).toContain('elder')
    expect(text).toContain('smith')
  })

  it('shows the life stage and the calling in German', async () => {
    await loadLocale('de')
    const host = render({ age_stage: 'elder', specialty: 'smith', discoveries: [] })
    const text = host.textContent ?? ''
    expect(text).toContain('Alter')
    expect(text).toContain('Schmied')
    expect(text).not.toContain('elder')
  })

  it('shows a calling it does not name as its words', async () => {
    await loadLocale('de')
    const host = render({ age_stage: 'adult', specialty: 'cloud_sculptor', discoveries: [] })
    expect(host.textContent).toContain('cloud sculptor')
  })
})
