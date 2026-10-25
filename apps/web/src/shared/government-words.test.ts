import { afterEach, describe, expect, it } from 'vitest'
import { loadLocale } from '../i18n'
import { leadershipOf } from '../game/model/leadership'
import { governmentWord } from './government-words'

describe('governmentWord', () => {
  afterEach(async () => {
    await loadLocale('en')
  })

  it('shows a form of government as its English word', () => {
    expect(governmentWord('chiefdom')).toBe('chiefdom')
    expect(governmentWord('stratocracy')).toBe('stratocracy')
  })

  it('shows a form of government in the active language', async () => {
    await loadLocale('de')
    expect(governmentWord('monarchy')).toBe('Monarchie')
    await loadLocale('ja')
    expect(governmentWord('republic')).toBe('共和制')
  })

  it('shows the tribe’s government in the leadership card in German', async () => {
    await loadLocale('de')
    const leadership = leadershipOf(
      { governments: [{ lineage_id: 'L1', kind: 'monarchy', leader_id: null }] } as never,
      'L1',
    )
    expect(leadership?.government).toBe('Monarchie')
  })
})
