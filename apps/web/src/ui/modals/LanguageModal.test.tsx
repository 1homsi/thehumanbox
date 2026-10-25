// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LanguageModal } from './LanguageModal'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('LanguageModal in a world with no tribes', () => {
  it('lays the table out with only the concept column', () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root?.render(
        <LanguageModal
          organisms={[]}
          lineageWords={{}}
          sexWords={['m', 'f']}
          onClose={() => {}}
          lineageNames={{}}
        />,
      ),
    )
    const table = document.querySelector<HTMLElement>('.lang-table')!
    // repeat(0, 1fr) is not a valid track list, so the whole layout would fall back to one column.
    expect(table.style.gridTemplateColumns).toBe('120px')
  })
})
