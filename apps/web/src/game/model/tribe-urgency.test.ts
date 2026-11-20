import { describe, expect, it } from 'vitest'
import { HOLD_TICKS, holdUrgency, lossTrend, recordLoss, tribeUrgency, urgencyColor } from './tribe-urgency'

const calm = { peril: null, losses: undefined, alive: 30, food: 0.8 }

describe('tribeUrgency', () => {
  it('leaves a calm, fed tribe alone', () => {
    expect(tribeUrgency(calm)).toBeNull()
  })

  it('does not call old age or a single death an emergency', () => {
    expect(tribeUrgency({ ...calm, losses: { old_age: 6 } })).toBeNull()
    expect(tribeUrgency({ ...calm, losses: { beasts: 1 } })).toBeNull()
    expect(tribeUrgency({ ...calm, losses: { war: 2 } })).toBeNull()
  })

  it('warns of famine as soon as food runs low, before anyone dies', () => {
    expect(tribeUrgency({ ...calm, food: 0.2 })).toEqual({
      kind: 'famine',
      lost: 0,
      alive: 30,
      total: 30,
      level: 0,
    })
  })

  it('counts the dead of the season against everyone the tribe had', () => {
    const u = tribeUrgency({ ...calm, alive: 24, losses: { starvation: 5, old_age: 2 } })
    expect(u).toMatchObject({ kind: 'famine', lost: 7, alive: 24, total: 31 })
    expect(u!.level).toBeCloseTo(7 / 31 / 0.4)
  })

  it('names war and plague losses when they are heavy', () => {
    expect(tribeUrgency({ ...calm, alive: 20, losses: { war: 2, combat: 2 } })?.kind).toBe('war')
    expect(tribeUrgency({ ...calm, alive: 20, losses: { sickness: 4, old_age: 1 } })?.kind).toBe('plague')
    expect(tribeUrgency({ ...calm, alive: 20, losses: { fire: 5 } })?.kind).toBe('danger')
  })

  it('takes the kind from the peril when the tribe is on the brink', () => {
    expect(tribeUrgency({ ...calm, alive: 4, peril: { cause: 'thirst' } })?.kind).toBe('thirst')
    expect(tribeUrgency({ ...calm, alive: 4, peril: { cause: 'no_children' } })?.kind).toBe('danger')
  })

  it('caps the level at fully red', () => {
    expect(tribeUrgency({ ...calm, alive: 2, losses: { starvation: 30 } })!.level).toBe(1)
  })
})

describe('holdUrgency', () => {
  const famine = tribeUrgency({ ...calm, food: 0.1 })!

  it('keeps a lapsed danger for a while so the card does not blink', () => {
    const held = holdUrgency(null, famine, 1000)
    expect(holdUrgency(held, null, 1000 + HOLD_TICKS)?.urgency).toBe(famine)
    expect(holdUrgency(held, null, 1001 + HOLD_TICKS)).toBeNull()
  })

  it('follows the latest numbers while the danger lasts', () => {
    const worse = { ...famine, lost: 3 }
    expect(holdUrgency(holdUrgency(null, famine, 10), worse, 20)).toEqual({ urgency: worse, seen: 20 })
  })

  it('drops what it held when the world goes back in time', () => {
    expect(holdUrgency(holdUrgency(null, famine, 5000), null, 100)).toBeNull()
  })
})

describe('urgencyColor', () => {
  it('runs from amber to red', () => {
    expect(urgencyColor(0)).toBe('rgb(224, 160, 48)')
    expect(urgencyColor(1)).toBe('rgb(208, 48, 42)')
    expect(urgencyColor(5)).toBe(urgencyColor(1))
  })
})

describe('lossTrend', () => {
  const feed = (rows: [number, number][]) =>
    rows.reduce((acc, [tick, lost]) => recordLoss(acc, tick, lost), [] as ReturnType<typeof recordLoss>)

  it('rises while deaths mount and eases as they age out of the season', () => {
    expect(
      lossTrend(
        feed([
          [0, 2],
          [100, 3],
          [200, 5],
        ]),
      ),
    ).toBe('rising')
    expect(
      lossTrend(
        feed([
          [0, 5],
          [100, 4],
        ]),
      ),
    ).toBe('easing')
    expect(
      lossTrend(
        feed([
          [0, 5],
          [100, 5],
        ]),
      ),
    ).toBe('flat')
    expect(lossTrend(feed([[0, 5]]))).toBe('flat')
  })

  it('compares against about a day ago, not the whole history', () => {
    const rows: [number, number][] = [
      [0, 1],
      [300, 6],
      [HOLD_TICKS + 300, 6],
      [HOLD_TICKS + 400, 6],
    ]
    const samples = feed(rows)
    expect(samples[0]!.tick).toBe(HOLD_TICKS + 300)
    expect(lossTrend(samples)).toBe('flat')
  })

  it('does not flicker on a repeated frame and restarts when the world goes back in time', () => {
    expect(
      feed([
        [0, 1],
        [100, 2],
        [100, 2],
      ]),
    ).toHaveLength(2)
    expect(
      feed([
        [500, 9],
        [100, 1],
      ]),
    ).toEqual([{ tick: 100, lost: 1 }])
  })
})
