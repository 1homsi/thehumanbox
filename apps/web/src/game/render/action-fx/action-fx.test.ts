import { beforeEach, describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from '../../../simulation/sandbox'
import { FX_SPECS, fxForCommand, type FxKind } from './fx-kinds'
import { PAINTERS, seeded, type FxFrame, type Painter } from './fx-painters'
import { FLOAT_MS, isIdle, playFx, resetFxForTests, showFloat, snapshot } from './fx-store'
import { floatText, floatTone, withActionFx } from './with-action-fx'

/** A painter that records what it was asked to draw. */
function recorder() {
  const calls: string[] = []
  const painter: Painter = {
    px: (x, y, color, size = 1) => calls.push(`px ${x} ${y} ${color} ${size}`),
    rect: (x, y, w, h, color) => calls.push(`rect ${x} ${y} ${w} ${h} ${color}`),
    alpha: (a) => calls.push(`alpha ${a.toFixed(3)}`),
    screen: (color, a) => calls.push(`screen ${color} ${a.toFixed(3)}`),
  }
  return { calls, painter }
}

function frame(kind: FxKind, t: number, reduced = false): FxFrame {
  return {
    t,
    ms: t * FX_SPECS[kind].ms,
    r: 48,
    rand: seeded(42),
    reduced,
    viewW: 200,
    viewH: 120,
  }
}

describe('the action effect painters', () => {
  const kinds = Object.keys(PAINTERS) as FxKind[]

  it('has a painter and a timing for every effect', () => {
    expect(new Set(kinds)).toEqual(new Set(Object.keys(FX_SPECS)))
  })

  it.each(kinds)('%s draws pixels over its life and the same pixels for the same frame', (kind) => {
    let drew = 0
    for (const t of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
      const a = recorder()
      const b = recorder()
      PAINTERS[kind](a.painter, frame(kind, t))
      PAINTERS[kind](b.painter, frame(kind, t))
      expect(a.calls).toEqual(b.calls)
      drew += a.calls.filter(
        (c) => c.startsWith('px') || c.startsWith('rect') || c.startsWith('screen'),
      ).length
      expect(a.calls.join(' ')).not.toContain('NaN')
    }
    expect(drew).toBeGreaterThan(0)
  })

  it('never strobes the flash for players who asked for less motion', () => {
    const bright = (reduced: boolean) =>
      Math.max(
        0,
        ...[0, 0.02, 0.04, 0.06].flatMap((t) => {
          const r = recorder()
          PAINTERS.nuke(r.painter, frame('nuke', t, reduced))
          return r.calls.filter((c) => c.startsWith('screen')).map((c) => Number(c.split(' ')[2]))
        }),
      )
    expect(bright(true)).toBeLessThan(0.4)
    expect(bright(false)).toBeGreaterThan(0.6)
  })
})

describe('the effect each command plays', () => {
  it('plays the nuke over a wide reach and weather over the whole view', () => {
    expect(fxForCommand({ cmd: 'nuke', x: 10, y: 20 })).toEqual({ kind: 'nuke', x: 10, y: 20, r: 16 })
    expect(fxForCommand({ cmd: 'weather', kind: 'storm' })).toMatchObject({ kind: 'sky_storm', x: null })
    expect(fxForCommand({ cmd: 'drought', active: true })).toMatchObject({ kind: 'sky_heat' })
  })

  it('summons monsters with a dark puff and plays nothing for renames', () => {
    expect(fxForCommand({ cmd: 'spawn_animal', x: 1, y: 2, kind: 'dragon' })?.kind).toBe('summon')
    expect(fxForCommand({ cmd: 'spawn_animal', x: 1, y: 2, kind: 'deer' })?.kind).toBe('spawn')
    expect(fxForCommand({ cmd: 'rename_tribe', lineage: 'a', name: 'b' })).toBeNull()
  })

  it('gives every deadly tool its own effect', () => {
    const deadly = SANDBOX_CATEGORIES.find((c) => c.id === 'bad')!.tools
    for (const tool of deadly) {
      const cmd = tool.build?.(5, 5, 2) ?? tool.fire!
      expect(fxForCommand(cmd), tool.id).not.toBeNull()
    }
  })
})

describe('the effects store', () => {
  beforeEach(() => resetFxForTests())

  it('drops effects and floats once they have played', () => {
    playFx('meteor', 3, 4, 2, 1000)
    showFloat('12 people killed', 3, 4, 'harm', 1000)
    expect(snapshot(1100).fxs).toHaveLength(1)
    expect(snapshot(1100).floats).toHaveLength(1)
    expect(snapshot(1000 + FX_SPECS.meteor.ms + 1).fxs).toHaveLength(0)
    expect(isIdle(1000 + FLOAT_MS + FX_SPECS.meteor.ms)).toBe(true)
  })

  it('stacks floats on one spot instead of drawing them over each other', () => {
    showFloat('a', 3, 4, 'info', 0)
    showFloat('b', 3, 4, 'info', 10)
    showFloat('c', 40, 40, 'info', 20)
    expect(snapshot(30).floats.map((f) => f.slot)).toEqual([0, 1, 0])
  })

  it('shakes the view for the big ones only', () => {
    playFx('heal', 1, 1, 2, 0)
    expect(snapshot(10).shake).toBeNull()
    playFx('nuke', 1, 1, 14, 0)
    expect(snapshot(100).shake?.strength).toBe(FX_SPECS.nuke.shake)
  })
})

describe('sending a command with its effect', () => {
  beforeEach(() => resetFxForTests())

  it('plays the effect at once and floats whom it killed once the simulation answers', async () => {
    const send = withActionFx(async () => ({ applied: true, code: 'disaster_killed', count: 12, name: null }))
    const pending = send({ cmd: 'meteor', x: 7, y: 9, radius: 3 })
    expect(snapshot().fxs[0]).toMatchObject({ kind: 'meteor', x: 7, y: 9 })
    await pending
    const [float] = snapshot().floats
    expect(float).toMatchObject({ x: 7, y: 9, tone: 'harm' })
    expect(float.text).toContain('12')
  })

  it('says when a tool had no effect', async () => {
    const send = withActionFx(async () => ({ applied: false, code: 'failed', count: 0, name: null }))
    await send({ cmd: 'tsunami', x: 1, y: 1 })
    expect(snapshot().floats[0]).toMatchObject({ tone: 'info' })
  })

  it('tells the whole toll of a disaster: the dead and the buildings', () => {
    const text = floatText({ applied: true, code: 'disaster_killed', count: 37, name: null, buildings: 12 })
    expect(text).toBe('37 people killed · 12 buildings damaged')
    expect(floatText({ applied: true, code: 'disaster_killed', count: 37, name: null })).toBe(
      '37 people killed',
    )
  })

  it('colours help and harm apart', () => {
    expect(floatTone({ applied: true, code: 'healed', count: 2, name: null })).toBe('help')
    expect(floatTone({ applied: true, code: 'disaster_hurt', count: 2, name: null })).toBe('harm')
    expect(floatTone({ applied: true, code: 'disaster_none', count: 0, name: null })).toBe('info')
  })
})
