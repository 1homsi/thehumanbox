// @vitest-environment happy-dom
import { SpriteLayer } from 'xipjs'
import { describe, expect, it } from 'vitest'
import { drawWorkActivity, type WorkActivity } from '../../activity-visuals'
import { GlyphSet } from '../overlays/glyph-atlas'
import { SpriteRecorder } from '../overlays/recorder'
import { ShapeAtlas } from '../overlays/shape-atlas'
import { stubHost } from '../overlays/test-support'
import { emitWorkPose, isFastPose } from './work-poses'

function recorder() {
  const host = stubHost()
  const shape = new SpriteLayer()
  const rec = new SpriteRecorder(shape, new SpriteLayer(), new ShapeAtlas(host), new GlyphSet(host))
  return { shape, rec }
}

function sprites(layer: SpriteLayer) {
  return Array.from({ length: layer.count }, (_, i) => ({
    x: layer.x[i],
    y: layer.y[i],
    w: layer.w[i],
    h: layer.h[i],
    // A turn of pi either way is the same quad.
    rotation: Math.abs(layer.rotation[i]),
    color: layer.color[i],
    flags: layer.flags[i],
  }))
}

describe('work poses written straight into sprites', () => {
  const activities: WorkActivity[] = ['build', 'chop', 'mine', 'farm', 'gather', 'rest']

  it('draw the same quads as the canvas painter through the recorder', () => {
    const canvas = recorder()
    const direct = recorder()
    const ctx = canvas.rec.asContext()
    let checked = 0
    let dust = 0
    for (const activity of activities) {
      if (!isFastPose(activity)) throw new Error(`${activity} should be a fast pose`)
      for (const flipped of [false, true])
        for (const alpha of [1, 0.12])
          for (let k = 0; k < 40; k++) {
            const x = 100.4 + k * 3.37
            const y = 60.6 + k * 1.91
            const time = 5000 + k * 97
            const phase = (k * 523) % 1000
            canvas.rec.begin({ zoom: 1, dpr: 1 })
            direct.rec.begin({ zoom: 1, dpr: 1 })
            ctx.globalAlpha = alpha
            drawWorkActivity(ctx, activity, x, y, flipped, time, phase)
            emitWorkPose(direct.rec, activity, x, y, flipped, time, phase, alpha)
            const a = sprites(canvas.shape)
            const b = sprites(direct.shape)
            expect(b).toHaveLength(a.length)
            a.forEach((q, i) => {
              expect(b[i].color).toBe(q.color)
              expect(b[i].flags).toBe(q.flags)
              for (const f of ['x', 'y', 'w', 'h', 'rotation'] as const) expect(b[i][f]).toBeCloseTo(q[f], 4)
            })
            if (activity === 'chop' && a.length === 4) dust++
            checked++
          }
    }
    expect(checked).toBe(6 * 2 * 2 * 40)
    // The dust that flies off a tool at the top of its swing was among the cases.
    expect(dust).toBeGreaterThan(0)
  })

  it('leaves fishing to the canvas painter', () => {
    expect(isFastPose('fish')).toBe(false)
    expect(isFastPose(null)).toBe(false)
  })
})
