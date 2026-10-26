import { describe, expect, it } from 'vitest'
import { LABEL_FADE_IN_MS, LABEL_FADE_OUT_MS, LabelPresence } from './label-presence'

const STEP = 30

function leaving(p: LabelPresence<string>): [string, string, number][] {
  const out: [string, string, number][] = []
  p.leaving((key, data, alpha) => out.push([key, data, Math.round(alpha * 1e6) / 1e6]))
  return out
}

/** Paints every `STEP` ms from `from` to `to`, asking about `ann` each time; returns the last opacity. */
function paintFor(
  p: LabelPresence<string>,
  from: number,
  to: number,
  wanted: boolean,
  data?: string,
): number {
  let alpha = 0
  for (let t = from; t <= to; t += STEP) {
    p.begin(t)
    alpha = p.set('ann', wanted, data)
  }
  return alpha
}

describe('LabelPresence', () => {
  it('fades a label in over the fade-in time, from nothing to full strength', () => {
    const p = new LabelPresence<string>()
    p.begin(0)
    expect(p.set('ann', true, 'ANN')).toBe(0)
    expect(paintFor(p, 0, LABEL_FADE_IN_MS / 2, true, 'ANN')).toBeCloseTo(0.5)
    expect(paintFor(p, LABEL_FADE_IN_MS / 2, LABEL_FADE_IN_MS, true, 'ANN')).toBeCloseTo(1)
    expect(p.fading).toBe(false)
  })

  it('does not jump to the end of a fade after a long pause', () => {
    const p = new LabelPresence<string>()
    p.begin(0)
    p.set('ann', true, 'ANN')
    p.begin(60_000)
    expect(p.set('ann', true, 'ANN')).toBeLessThan(1)
  })

  it('keeps a label that is no longer wanted where it was, fading it out with its last data', () => {
    const p = new LabelPresence<string>()
    paintFor(p, 0, LABEL_FADE_IN_MS, true, 'at-the-door')
    // Nobody asks about the label any more (the person walked off): it fades out where it was last shown.
    p.begin(LABEL_FADE_IN_MS + STEP)
    expect(leaving(p)).toEqual([
      ['ann', 'at-the-door', Math.round((1 - STEP / LABEL_FADE_OUT_MS) * 1e6) / 1e6],
    ])
    expect(p.dataOf('ann')).toBe('at-the-door')
    expect(p.fading).toBe(true)
  })

  it('drops a label once its fade out has finished', () => {
    const p = new LabelPresence<string>()
    paintFor(p, 0, LABEL_FADE_IN_MS, true, 'ANN')
    let last: [string, string, number][] = []
    for (let t = LABEL_FADE_IN_MS + STEP; t <= LABEL_FADE_IN_MS + LABEL_FADE_OUT_MS + STEP; t += STEP) {
      p.begin(t)
      last = leaving(p)
    }
    expect(last).toEqual([])
    expect(p.dataOf('ann')).toBeUndefined()
  })

  it('fades a label out when the paint itself stops wanting it', () => {
    const p = new LabelPresence<string>()
    paintFor(p, 0, LABEL_FADE_IN_MS, true, 'ANN')
    const unwanted = (step: number) => {
      p.begin(LABEL_FADE_IN_MS + step * STEP)
      return p.set('ann', false)
    }
    expect(unwanted(1)).toBeCloseTo(1 - STEP / LABEL_FADE_OUT_MS)
    expect(p.visible('ann')).toBe(true)
    expect(unwanted(2)).toBeCloseTo(1 - (2 * STEP) / LABEL_FADE_OUT_MS)
    expect(unwanted(3)).toBeCloseTo(1 - (3 * STEP) / LABEL_FADE_OUT_MS)
    expect(unwanted(4)).toBeCloseTo(1 - (4 * STEP) / LABEL_FADE_OUT_MS)
    expect(p.visible('ann')).toBe(true)
    expect(unwanted(5)).toBeCloseTo(1 - (5 * STEP) / LABEL_FADE_OUT_MS)
    expect(p.visible('ann')).toBe(false)
    expect(p.dataOf('ann')).toBe('ANN')
  })

  it('reports a label as visible only once it is at least half shown', () => {
    const p = new LabelPresence<string>()
    p.begin(0)
    p.set('ann', true, 'ANN')
    p.begin(LABEL_FADE_IN_MS / 4)
    p.set('ann', true, 'ANN')
    expect(p.visible('ann')).toBe(false)
    p.begin(LABEL_FADE_IN_MS / 2)
    p.set('ann', true, 'ANN')
    expect(p.visible('ann')).toBe(true)
  })

  it('forgets everything on clear', () => {
    const p = new LabelPresence<string>()
    paintFor(p, 0, LABEL_FADE_IN_MS, true, 'ANN')
    p.clear()
    p.begin(LABEL_FADE_IN_MS + STEP)
    expect(leaving(p)).toEqual([])
    expect(p.dataOf('ann')).toBeUndefined()
  })
})
