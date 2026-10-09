import { describe, expect, it } from 'vitest'
import { FLOURISH_TICKS, type EraChange } from '../../../model/era-flourish'
import { paintEraFlourish } from './paint-era-flourish'
import type { CfFrame } from './frame'

/** Records the text drawn and the arcs stroked, in order. */
function recorder() {
  const texts: string[] = []
  const arcs: number[] = []
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    stroke() {},
    fillRect() {},
    arc(_x: number, _y: number, r: number) {
      arcs.push(r)
    },
    fillText(text: string) {
      texts.push(text)
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, texts, arcs }
}

function frame(tick: number): CfFrame {
  return {
    world: {
      tick,
      lineage_names: { red: 'Vajra' },
      settlements: [
        { lineage_id: 'red', name: 'Vajra', center: [20, 20], population: 5 },
        { lineage_id: 'red', name: 'Vajra Hills', center: [40, 40], population: 9 },
      ],
    },
    ox: 0,
    oy: 0,
    W: 800,
    H: 800,
  } as unknown as CfFrame
}

const change: EraChange = { lineage: 'red', era: 'bronze', tick: 1000 }

describe('era flourish', () => {
  it('names the new age on a plate over the tribe’s biggest settlement, and rings out from it', () => {
    const { ctx, texts, arcs } = recorder()
    paintEraFlourish(ctx, frame(1000 + FLOURISH_TICKS / 2), [change])
    expect(texts).toEqual(['Vajra · BRONZE AGE'])
    expect(arcs.length).toBeGreaterThan(0)
  })

  it('draws nothing once its time is up, or before the change happens', () => {
    const late = recorder()
    paintEraFlourish(late.ctx, frame(1000 + FLOURISH_TICKS), [change])
    expect(late.texts).toEqual([])
    const early = recorder()
    paintEraFlourish(early.ctx, frame(900), [change])
    expect(early.texts).toEqual([])
    expect(early.arcs).toEqual([])
  })

  it('does nothing for a tribe with no settlement on the map', () => {
    const { ctx, texts } = recorder()
    paintEraFlourish(ctx, frame(1100), [{ lineage: 'blue', era: 'iron', tick: 1000 }])
    expect(texts).toEqual([])
  })
})
