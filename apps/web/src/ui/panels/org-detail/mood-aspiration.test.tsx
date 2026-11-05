// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { hasMessage, loadLocale } from '../../../i18n'
import type { OrganismState } from '../../../shared/types'
import { AspirationSection } from './character'
import { ASPIRATIONS, MOODS } from './icons'
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

function render(node: React.ReactNode): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(node))
  return host
}

// Line endings normalised, so a Windows checkout (core.autocrlf) reads the same.
const simSource = (file: string) =>
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../crates/sim-core/src', file),
    'utf8',
  ).replace(/\r\n/g, '\n')
/** The quoted words a Rust function returns, read from the code that is not a test. */
const quotedWords = (source: string) =>
  new Set([...source.split('#[cfg(test)]')[0].matchAll(/^\s*"([a-z]+)"\s*$/gm)].map((m) => m[1]))

describe('the words the simulation sends', () => {
  it('lists every mood the simulation can return', () => {
    expect(new Set(MOODS)).toEqual(quotedWords(simSource('organism/organism/mood.rs')))
  })

  it('lists every aspiration the simulation hands out', () => {
    const picked =
      simSource('sim/civ/civ_tick/people.rs').match(/let pick: &'static str = ([\s\S]*?);\n/)?.[1] ?? ''
    expect(new Set(ASPIRATIONS)).toEqual(quotedWords(picked))
  })

  it('has a label for every mood and aspiration', () => {
    for (const id of MOODS) expect(hasMessage(`person.mood.${id}`), id).toBe(true)
    for (const id of ASPIRATIONS) expect(hasMessage(`person.aspiration.label.${id}`), id).toBe(true)
  })
})

describe('mood and aspiration in the person panel', () => {
  const org = {
    age_stage: 'adult',
    discoveries: [],
    mood: 'joyful',
    aspiration: 'seeker',
  } as unknown as OrganismState

  it('reads in English', () => {
    expect(render(<StatusChips org={org} />).textContent).toContain('feels joyful')
    act(() => root?.unmount())
    root = null
    expect(render(<AspirationSection org={org} />).textContent).toContain('seeker')
  })

  it('reads in German with no English id left', async () => {
    await loadLocale('de')
    const status = render(<StatusChips org={org} />).textContent ?? ''
    expect(status).toContain('fühlt sich fröhlich')
    expect(status).not.toContain('joyful')
    act(() => root?.unmount())
    root = null
    const aspiration = render(<AspirationSection org={org} />).textContent ?? ''
    expect(aspiration).toContain('Sucher')
    expect(aspiration).not.toContain('seeker')
  })

  it('shows an id that happens to name an Object property as sent', () => {
    const odd = { ...org, mood: 'constructor', aspiration: 'toString' } as unknown as OrganismState
    expect(render(<StatusChips org={odd} />).textContent).toContain('feels constructor')
    act(() => root?.unmount())
    root = null
    expect(render(<AspirationSection org={odd} />).textContent).toContain('toString')
  })

  it('shows a word it does not know as sent', async () => {
    await loadLocale('de')
    const odd = { ...org, mood: 'wistful', aspiration: 'stargazer' } as unknown as OrganismState
    expect(render(<StatusChips org={odd} />).textContent).toContain('wistful')
    act(() => root?.unmount())
    root = null
    expect(render(<AspirationSection org={odd} />).textContent).toContain('stargazer')
  })
})
