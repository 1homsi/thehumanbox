import { describe, expect, it } from 'vitest'
import {
  AIM_MIN_TILES,
  GLANCE_MS,
  GLIDE_MS,
  GLIDE_SNAP_MS,
  GaitStore,
  JUMP_TILES,
  PEP_CALM,
  PEP_LIVELY,
  PEP_STEADY,
  SCATTER_X,
  SCATTER_Y,
  TURN_AFTER_TILES,
  aimOf,
  breathDown,
  glancing,
  glideFactor,
  glideToward,
  pepOf,
  personGlide,
  scatterX,
  scatterY,
  strideOf,
  walkFrame,
} from './people-motion'

describe('gliding between simulation frames', () => {
  it('closes the same share of the gap whatever the display rate', () => {
    const at60 = 1 - (1 - glideFactor(1000 / 60)) ** 6
    const at30 = 1 - (1 - glideFactor(1000 / 30)) ** 3
    expect(at60).toBeCloseTo(at30, 9)
    expect(glideFactor(GLIDE_MS)).toBeCloseTo(1 - 1 / Math.E, 9)
  })

  it('snaps on the first frame, after a long gap and when time runs backwards', () => {
    expect(glideFactor(Infinity)).toBe(1)
    expect(glideFactor(GLIDE_SNAP_MS + 1)).toBe(1)
    expect(glideFactor(0)).toBe(1)
    expect(glideFactor(-5)).toBe(1)
    expect(glideFactor(NaN)).toBe(1)
  })

  it('moves part of the way, lands exactly when close and jumps a placement', () => {
    expect(glideToward(10, 11, 0.25)).toBeCloseTo(10.25, 9)
    expect(glideToward(10, 10.003, 0.25)).toBe(10.003)
    expect(glideToward(10, 10 + JUMP_TILES + 1, 0.25)).toBe(10 + JUMP_TILES + 1)
    expect(glideToward(10, 9, 1)).toBe(9)
  })

  it('reaches a target that stopped without overshooting it', () => {
    let x = 0
    let last = 0
    for (let k = 0; k < 120; k++) {
      x = glideToward(x, 1, glideFactor(16))
      expect(x).toBeGreaterThanOrEqual(last)
      expect(x).toBeLessThanOrEqual(1)
      last = x
    }
    expect(x).toBe(1)
  })

  it('gives each person a slightly different pace, never past the target', () => {
    const k = glideFactor(16)
    const paces = new Set<number>()
    for (let phase = 0; phase < 800; phase++) {
      const own = personGlide(k, phase)
      expect(own).toBeGreaterThan(k * 0.79)
      expect(own).toBeLessThan(k * 1.21)
      paces.add(own)
      expect(personGlide(1, phase)).toBe(1)
    }
    expect(paces.size).toBeGreaterThan(50)
  })
})

describe('facing', () => {
  function store() {
    const gait = new GaitStore()
    gait.reserve(2)
    gait.init(0, 10, 10)
    return gait
  }

  it('turns only after a real stretch the other way', () => {
    const gait = store()
    gait.face(0, -TURN_AFTER_TILES / 4)
    gait.face(0, -TURN_AFTER_TILES / 4)
    expect(gait.flipped[0]).toBe(0)
    gait.face(0, -TURN_AFTER_TILES / 4)
    gait.face(0, -TURN_AFTER_TILES / 4)
    expect(gait.flipped[0]).toBe(1)
  })

  it('forgets a wobble as soon as the person goes on the way they faced', () => {
    const gait = store()
    for (let k = 0; k < 50; k++) {
      gait.face(0, -TURN_AFTER_TILES * 0.6)
      gait.face(0, TURN_AFTER_TILES * 0.6)
      expect(gait.flipped[0]).toBe(0)
    }
    gait.face(0, 0)
    expect(gait.turn[0]).toBe(0)
  })

  it('keeps facing while walking straight up or down', () => {
    const gait = store()
    gait.face(0, -1)
    expect(gait.flipped[0]).toBe(1)
    for (let k = 0; k < 20; k++) gait.face(0, 0)
    expect(gait.flipped[0]).toBe(1)
  })

  it('reports the sideways step of a glide, and none for a placement', () => {
    const gait = store()
    expect(gait.glide(0, 11, 10, 0.5)).toBeCloseTo(0.5, 9)
    expect(gait.x[0]).toBeCloseTo(10.5, 9)
    expect(gait.glide(0, 60, 40, 0.5)).toBe(0)
    expect(gait.x[0]).toBe(60)
    expect(gait.y[0]).toBe(40)
  })

  it('follows a person to a new slot and survives growing', () => {
    const a = store()
    const b = new GaitStore()
    b.reserve(1)
    a.face(0, -1)
    a.glide(0, 9, 10, 1)
    b.copyFrom(a, 0, 0)
    b.reserve(500)
    expect(b.flipped[0]).toBe(1)
    expect(b.x[0]).toBe(9)
    expect(b.capacity).toBeGreaterThanOrEqual(500)
  })

  it('aims at a destination only when it is clearly to one side', () => {
    expect(aimOf(10, null)).toBe(0)
    expect(aimOf(10, undefined)).toBe(0)
    expect(aimOf(10, 10 + AIM_MIN_TILES / 2)).toBe(0)
    expect(aimOf(10, 14)).toBe(1)
    expect(aimOf(10, 3)).toBe(-1)
  })
})

describe('idle life', () => {
  it('breathes in a slow rhythm of its own for every person', () => {
    const starts = new Set<number>()
    for (let phase = 0; phase < 800; phase += 13) {
      let down = 0
      let changes = 0
      let first = -1
      let before = breathDown(0, phase, PEP_STEADY)
      for (let now = 0; now < 60000; now += 50) {
        const d = breathDown(now, phase, PEP_STEADY)
        if (d) down++
        if (d !== before) {
          changes++
          if (first < 0) first = now
        }
        before = d
      }
      expect(down / 1200).toBeGreaterThan(0.25)
      expect(down / 1200).toBeLessThan(0.45)
      expect(changes).toBeGreaterThan(20)
      expect(changes).toBeLessThan(45)
      starts.add(first)
    }
    expect(starts.size).toBeGreaterThan(20)
  })

  it('is livelier for children and slower for the old and the worn out', () => {
    const beats = (pep: number) => {
      let changes = 0
      let before = breathDown(0, 100, pep)
      for (let now = 0; now < 60000; now += 25) {
        const d = breathDown(now, 100, pep)
        if (d !== before) changes++
        before = d
      }
      return changes
    }
    expect(beats(PEP_LIVELY)).toBeGreaterThan(beats(PEP_STEADY))
    expect(beats(PEP_STEADY)).toBeGreaterThan(beats(PEP_CALM))
    expect(pepOf('child', 0.8, 0.9)).toBe(PEP_LIVELY)
    expect(pepOf('infant', 0.8, 0.9)).toBe(PEP_LIVELY)
    expect(pepOf('adult', 0.8, 0.9)).toBe(PEP_STEADY)
    expect(pepOf('elder', 0.8, 0.9)).toBe(PEP_CALM)
    expect(pepOf('adult', 0.1, 0.9)).toBe(PEP_CALM)
    expect(pepOf('child', 0.8, 0.2)).toBe(PEP_CALM)
  })

  it('glances round briefly, children more often', () => {
    const share = (pep: number) => {
      let on = 0
      for (let now = 0; now < 120000; now += 20) if (glancing(now, 321, pep)) on++
      return on / 6000
    }
    expect(share(PEP_STEADY)).toBeGreaterThan(0.04)
    expect(share(PEP_STEADY)).toBeLessThan(0.12)
    expect(share(PEP_LIVELY)).toBeGreaterThan(share(PEP_STEADY))
    expect(share(PEP_CALM)).toBeLessThan(share(PEP_STEADY))
    let longest = 0
    let run = 0
    for (let now = 0; now < 60000; now += 10) {
      run = glancing(now, 321, PEP_STEADY) ? run + 10 : 0
      if (run > longest) longest = run
    }
    expect(longest).toBeLessThanOrEqual(GLANCE_MS)
  })
})

describe('stride and scatter', () => {
  it('ties the walk frame to the ground covered: short legs take more steps', () => {
    const steps = (stride: number) => {
      const frames: number[] = []
      for (let d = 0; d <= 1; d += 0.01) {
        const f = walkFrame(d, stride, 0, 4)
        if (frames[frames.length - 1] !== f) frames.push(f)
      }
      return frames.length
    }
    expect(walkFrame(0, 4, 0, 4)).toBe(0)
    expect(walkFrame(0.3, 4, 0, 4)).toBe(1)
    expect(walkFrame(0.3, 4, 400, 4)).toBe(3)
    expect(steps(strideOf('child', PEP_LIVELY))).toBeGreaterThan(steps(strideOf('adult', PEP_STEADY)))
    expect(strideOf('adult', PEP_CALM)).toBeGreaterThan(strideOf('adult', PEP_STEADY))
    expect(strideOf('elder', PEP_CALM)).toBeGreaterThan(strideOf('adult', PEP_STEADY))
    expect(strideOf('child', PEP_CALM)).toBe(strideOf('child', PEP_LIVELY))
  })

  it('offsets each person by a few whole pixels inside their tile', () => {
    const seen = new Set<string>()
    for (let phase = 0; phase < 800; phase++) {
      const x = scatterX(phase)
      const y = scatterY(phase)
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(Math.abs(x)).toBeLessThanOrEqual(SCATTER_X)
      expect(Math.abs(y)).toBeLessThanOrEqual(SCATTER_Y)
      seen.add(`${x},${y}`)
    }
    expect(seen.size).toBe((2 * SCATTER_X + 1) * (2 * SCATTER_Y + 1))
  })
})
