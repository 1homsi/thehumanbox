import { describe, expect, it } from 'vitest'
import { familyLineText, familyLines, familySentence } from './family-lines'

const p = (surname: string | undefined, lineage_id: string, age: number, alive = true) => ({
  alive,
  lineage_id,
  surname,
  age,
})

describe('familyLines', () => {
  it('counts the living by surname, most numerous first, within one tribe', () => {
    const lines = familyLines(
      [p('Mira', 'a', 600), p('Mira', 'a', 1200), p('Tomas', 'a', 6000), p('Bo', 'b', 60)],
      'a',
    )
    expect(lines.map((l) => [l.surname, l.living])).toEqual([
      ['Mira', 2],
      ['Tomas', 1],
    ])
  })

  it('marks the family holding the tribe’s oldest living member', () => {
    const lines = familyLines([p('Mira', 'a', 600 * 5), p('Tomas', 'a', 600 * 50)], 'a')
    const tomas = lines.find((l) => l.surname === 'Tomas')
    expect(tomas?.longestLived).toBe(true)
    expect(tomas?.eldestDays).toBe(50)
    expect(lines.find((l) => l.surname === 'Mira')?.longestLived).toBe(false)
  })

  it('leaves out the dead, people with no surname, and other tribes', () => {
    const lines = familyLines(
      [p('Ghost', 'a', 9000, false), p(undefined, 'a', 100), p('Other', 'b', 100)],
      'a',
    )
    expect(lines).toEqual([])
  })

  it('keeps only the top few families', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((s, i) => p(s, 'a', 600 * (i + 1)))
    expect(familyLines(many, 'a', 3)).toHaveLength(3)
  })

  it('words a family line, naming the longest-lived one', () => {
    expect(familyLineText({ surname: 'Mira', living: 5, eldestDays: 41, longestLived: true })).toBe(
      'Mira ×5, eldest 41 days (longest-lived)',
    )
    expect(familyLineText({ surname: 'Tomas', living: 2, eldestDays: 9, longestLived: false })).toBe(
      'Tomas ×2',
    )
  })

  it('tells the family of a person in their tribe, or nothing without one', () => {
    const orgs = [p('Mira', 'a', 600 * 41), p('Mira', 'a', 600), p('Tomas', 'a', 600 * 9)]
    expect(familySentence({ surname: 'Mira', lineage_id: 'a' }, orgs)).toBe(
      'The Mira family in this tribe: 2 living, the eldest 41 days old.',
    )
    expect(familySentence({ lineage_id: 'a' }, orgs)).toBeNull()
    expect(familySentence({ surname: 'Nobody', lineage_id: 'a' }, orgs)).toBeNull()
  })
})
