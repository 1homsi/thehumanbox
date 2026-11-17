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
        count: 1,
      },
      { tick: 200, when: 'Year 1, Summer', title: 'A battle', text: 'Tor fought Mel', count: 1 },
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

  it('tells a recurring kind once, with how often it happened and its newest telling', () => {
    const unanswered = Array.from({ length: 12 }, (_, i) =>
      ev(1000 + i, 'forsaken', `prayer ${i} unanswered`),
    )
    const out = legendsOf([
      ...unanswered,
      ev(1005, 'battle', 'Tor fought Mel'),
      ev(900, 'battle', 'Mel fought Ash'),
      ev(950, 'answered', 'rain came to Tor'),
    ])
    expect(out.map((l) => [l.title, l.text, l.count])).toEqual([
      ['A prayer goes unanswered ×12', 'prayer 11 unanswered', 12],
      ['A battle', 'Tor fought Mel', 1],
      ['A prayer is answered', 'rain came to Tor', 1],
      ['A battle', 'Mel fought Ash', 1],
    ])
    expect(out[0].tick).toBe(1011)
  })

  it('counts every repeat, even past the limit, and leaves room for other legends', () => {
    const many = Array.from({ length: 40 }, (_, i) => ev(100 + i, 'forsaken', `unanswered ${i}`))
    const out = legendsOf([...many, ev(1, 'meteor', 'a star fell')], 5)
    expect(out.map((l) => l.title)).toEqual(['A prayer goes unanswered ×40', 'A star falls'])
  })

  it('is empty when nothing notable has happened', () => {
    expect(legendsOf([ev(1, 'born', 'Ada was born')])).toEqual([])
  })
})
