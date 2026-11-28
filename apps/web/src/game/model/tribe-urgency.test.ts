import { describe, expect, it } from 'vitest'
import { FAMINE_RISK_FOOD } from './famine-warning'
import {
  HARM_MIN,
  HARM_SHARE,
  HOLD_TICKS,
  holdUrgency,
  lossTrend,
  recordLoss,
  tribeUrgency,
  urgencyColor,
  type HeldUrgency,
  type LossSample,
} from './tribe-urgency'

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

describe('famine and violent losses together', () => {
  it('names famine first and counts every death of the season', () => {
    const u = tribeUrgency({ ...calm, alive: 20, losses: { starvation: 3, war: 4 } })
    expect(u).toMatchObject({ kind: 'famine', lost: 7, alive: 20, total: 27 })
    expect(u!.level).toBeCloseTo(7 / 27 / 0.4)
  })

  it('names famine when food runs low even if war has killed more', () => {
    expect(tribeUrgency({ ...calm, alive: 20, food: 0.1, losses: { war: 6, combat: 2 } })).toMatchObject({
      kind: 'famine',
      lost: 8,
    })
  })

  it('lets the peril cause outrank both', () => {
    expect(
      tribeUrgency({
        ...calm,
        alive: 6,
        food: 0.1,
        peril: { cause: 'war' },
        losses: { starvation: 2, war: 3 },
      })?.kind,
    ).toBe('war')
  })
})

describe('threshold edges', () => {
  it('warns of famine only below the risk line', () => {
    expect(FAMINE_RISK_FOOD).toBe(0.3)
    expect(tribeUrgency({ ...calm, food: 0.299 })?.kind).toBe('famine')
    expect(tribeUrgency({ ...calm, food: 0.3 })).toBeNull()
    expect(tribeUrgency({ ...calm, food: 0.301 })).toBeNull()
  })

  it('treats a single starvation death as famine whatever the food', () => {
    expect(tribeUrgency({ ...calm, food: 0.9, losses: { starvation: 1 } })?.kind).toBe('famine')
  })

  it('needs two violent deaths, however small the tribe', () => {
    expect(HARM_MIN).toBe(2)
    expect(tribeUrgency({ ...calm, alive: 3, losses: { war: 1 } })).toBeNull()
    expect(tribeUrgency({ ...calm, alive: 3, losses: { war: 2 } })?.kind).toBe('war')
  })

  it('needs a tenth of everyone the tribe had: below, at and above', () => {
    expect(HARM_SHARE).toBe(0.1)
    // 3 of 31 is just under a tenth, 3 of 30 is exactly a tenth, 3 of 29 is over it.
    expect(tribeUrgency({ ...calm, alive: 28, losses: { war: 3 } })).toBeNull()
    expect(tribeUrgency({ ...calm, alive: 27, losses: { war: 3 } })?.kind).toBe('war')
    expect(tribeUrgency({ ...calm, alive: 26, losses: { war: 3 } })?.kind).toBe('war')
  })

  it('counts old age in the total but not in the harm', () => {
    // 2 violent deaths of 20 people is exactly a tenth; 2 more who died of old age make it 2 of 22.
    expect(tribeUrgency({ ...calm, alive: 18, losses: { war: 2 } })?.kind).toBe('war')
    expect(tribeUrgency({ ...calm, alive: 18, losses: { war: 2, old_age: 2 } })).toBeNull()
  })
})

describe('a danger that clears inside the hold', () => {
  const war = tribeUrgency({ ...calm, alive: 18, losses: { war: 6 } })!

  it('stays up for a day after it was last seen, then goes', () => {
    const seen = holdUrgency(null, war, 1000)
    const lapsed = holdUrgency(seen, null, 1100)
    expect(lapsed?.urgency).toBe(war)
    expect(holdUrgency(lapsed, null, 1000 + HOLD_TICKS)?.urgency).toBe(war)
    expect(holdUrgency(lapsed, null, 1001 + HOLD_TICKS)).toBeNull()
  })

  it('restarts the clock if the danger comes back before the hold runs out', () => {
    const lapsed = holdUrgency(holdUrgency(null, war, 1000), null, 1100)
    const back = holdUrgency(lapsed, war, 1400)
    expect(back).toEqual({ urgency: war, seen: 1400 })
    expect(holdUrgency(back, null, 1400 + HOLD_TICKS)?.urgency).toBe(war)
    expect(holdUrgency(back, null, 1401 + HOLD_TICKS)).toBeNull()
  })
})

// #1189: the strip keeps its hold and its trend in component refs, and the sim
// does not save a tribe's recent dead (`recent_deaths` loads empty, see
// `a_tribes_recent_dead_do_not_survive_a_reload` in sim-core). A reload therefore
// starts all three from nothing. These pin today's behaviour; fixing it needs a
// save-format change, so they should flip when that lands.
describe('after a save and reload (today)', () => {
  const war = tribeUrgency({ ...calm, alive: 18, losses: { war: 6 } })!

  it('drops a danger that lapsed inside the hold', () => {
    const held = holdUrgency(null, war, 1000)
    expect(holdUrgency(held, null, 1200)?.urgency).toBe(war)
    const reloaded: HeldUrgency | null = null
    expect(holdUrgency(reloaded, null, 1200)).toBeNull()
  })

  it('forgets which way the losses were going', () => {
    const before = recordLoss(recordLoss([], 1000, 2), 1100, 5)
    expect(lossTrend(recordLoss(before, 1200, 6))).toBe('rising')
    const reloaded: LossSample[] = []
    expect(lossTrend(recordLoss(reloaded, 1200, 6))).toBe('flat')
  })

  it('loses a war the sim stops reporting, but keeps a famine read from food', () => {
    expect(tribeUrgency({ ...calm, alive: 18, losses: { war: 6 } })?.kind).toBe('war')
    expect(tribeUrgency({ ...calm, alive: 18, losses: undefined })).toBeNull()
    expect(tribeUrgency({ ...calm, alive: 18, food: 0.1, losses: undefined })?.kind).toBe('famine')
  })
})
