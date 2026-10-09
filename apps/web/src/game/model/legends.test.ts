import { describe, expect, it } from 'vitest'
import { legendsOf } from './legends'

const ev = (tick: number, type: string, detail: string, news?: boolean) => ({ tick, type, detail, news })

describe('legendsOf', () => {
  it('keeps the notable events only, newest first, each with a title', () => {
    const out = legendsOf([
      ev(100, 'born', 'Ada was born'),
      ev(300, 'eruption', 'the mountain above Tor erupted'),
      ev(200, 'battle', 'Tor fought Mel'),
      ev(400, 'chatter', 'two people talked'),
    ])
    expect(out).toEqual([
      {
        tick: 300,
        when: 'Year 1, Summer',
        title: 'The mountain wakes',
        text: 'the mountain above Tor erupted',
      },
      { tick: 200, when: 'Year 1, Summer', title: 'A battle', text: 'Tor fought Mel' },
    ])
  })

  it('trusts the sim’s own news flag over the kind list', () => {
    const out = legendsOf([ev(50, 'born', 'a rare birth', true)])
    expect(out.map((l) => l.title)).toEqual(['A notable event'])
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ev(i, 'meteor', `star ${i}`))
    expect(legendsOf(many, 5)).toHaveLength(5)
    expect(legendsOf(many, 5)[0].tick).toBe(19)
  })

  it('is empty when nothing notable has happened', () => {
    expect(legendsOf([ev(1, 'born', 'Ada was born')])).toEqual([])
  })
})
