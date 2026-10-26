// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { WordHistorySection } from './word-history'
import { wordHistoryRows } from './word-history-rows'
import type { FamilyWords, OrgDetail } from '../../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function relative(
  id: string,
  relation: FamilyWords['relation'],
  vocabulary: Record<string, string>,
  remembered = true,
): FamilyWords {
  return { id, name: remembered ? `Name ${id}` : '', alive: false, relation, remembered, vocabulary }
}

function detail(vocabulary: Record<string, string>, family: FamilyWords[]): Partial<OrgDetail> {
  return { vocabulary, family_words: family }
}

function render(d: Partial<OrgDetail>) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<WordHistorySection detail={d as OrgDetail} />))
  return host
}

describe('wordHistoryRows', () => {
  it('compares the person with each remembered relative on the common things they both name', () => {
    const rows = wordHistoryRows(
      detail({ food: 'ula', water: 'pi', grief: 'mo' }, [
        relative('m', 'mother', { food: 'ula', water: 'ka' }),
        relative('f', 'father', { food: 'ko' }),
      ]) as OrgDetail,
    )
    expect(rows.map((r) => r.concept)).toEqual(['food', 'water'])
    expect(rows[0]).toMatchObject({ concept: 'food', own: 'ula', drifted: true })
    expect(rows[0].relatives.map((r) => r.word)).toEqual(['ula', 'ko'])
    expect(rows[1].relatives.map((r) => r.word)).toEqual(['ka', null])
    expect(rows[1].drifted).toBe(true)
  })

  it('is not drifted when every relative who knows the word says the same', () => {
    const rows = wordHistoryRows(
      detail({ fire: 'tek' }, [
        relative('m', 'mother', { fire: 'tek' }),
        relative('f', 'father', {}),
      ]) as OrgDetail,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].drifted).toBe(false)
  })

  it('shows nothing when no relative is remembered, or nobody to compare with', () => {
    expect(wordHistoryRows(detail({ fire: 'tek' }, []) as OrgDetail)).toEqual([])
    expect(
      wordHistoryRows(detail({ fire: 'tek' }, [relative('m', 'mother', {}, false)]) as OrgDetail),
    ).toEqual([])
    expect(wordHistoryRows(null)).toEqual([])
  })

  it('leaves out a concept the person does not know, even if relatives do', () => {
    const rows = wordHistoryRows(
      detail({ food: 'ula' }, [relative('m', 'mother', { food: 'ula', fire: 'tek' })]) as OrgDetail,
    )
    expect(rows.map((r) => r.concept)).toEqual(['food'])
  })
})

describe('WordHistorySection', () => {
  it('shows the person and their family words, with drifted rows marked', () => {
    const host = render(
      detail({ food: 'ula', water: 'pi' }, [
        relative('m', 'mother', { food: 'ula', water: 'ka' }),
        relative('mm', 'maternal_grandmother', { food: 'tek' }),
      ]),
    )
    expect(host.textContent).toContain('WORD HISTORY')
    expect(host.textContent).toContain('mother')
    expect(host.textContent).toContain("mother's mother")
    expect(host.querySelectorAll('.word-history-row.drifted')).toHaveLength(2)
    expect(host.querySelectorAll('.word-history-chip.differs').length).toBeGreaterThan(0)
  })

  it('says a relative whose record is gone is not remembered, and keeps the dash for one who has no such word', () => {
    const host = render(
      detail({ food: 'ula' }, [relative('m', 'mother', {}, false), relative('f', 'father', { food: 'ula' })]),
    )
    expect(host.textContent).toContain('father')
    const gone = host.querySelector('.word-history-chip[title="not remembered"]')
    expect(gone?.textContent).toContain('not remembered')
    expect(gone?.textContent).not.toContain('—')
    // Chips in order: the person, then mother (remembered, no such word), then father.
    const noWord = render(
      detail({ food: 'ula' }, [relative('m', 'mother', {}), relative('f', 'father', { food: 'ula' })]),
    )
    const words = [...noWord.querySelectorAll('.word-history-chip b')].map((b) => b.textContent)
    expect(words).toEqual(['ula', '—', 'ula'])
  })

  it('renders nothing when there is no family to compare', () => {
    expect(render(detail({ food: 'ula' }, [])).textContent).toBe('')
  })
})
