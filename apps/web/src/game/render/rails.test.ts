import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../shared/types'

const launches: number[] = []
vi.mock('./era-traffic', async (importOriginal) => {
  const real = await importOriginal<typeof import('./era-traffic')>()
  return {
    ...real,
    drawLaunch: (_ctx: unknown, _x: number, _y: number, progress: number) => launches.push(progress),
    drawPlane: () => {},
  }
})

const { drawEraTraffic } = await import('./rails')
const { launchProgress, LAUNCH_PERIOD } = await import('./era-traffic')

/** The first tick at which spaceport `id` has a rocket climbing. */
function launchTick(id: number): number {
  for (let t = 0; t < LAUNCH_PERIOD; t++) if (launchProgress(id, t) !== null) return t
  throw new Error('no launch in a period')
}

function world(kind: string, tick: number, over: Record<string, unknown> = {}): WorldState {
  return {
    tick,
    buildings: [{ id: 7, kind, x: 10, y: 10, fw: 3, fh: 3, condition: 1, construction_progress: 1, ...over }],
    settlements: [],
  } as unknown as WorldState
}

const ctx = {} as CanvasRenderingContext2D
const draw = (w: WorldState) => drawEraTraffic(ctx, w, 0, 0, 800, 600, 1, 0)

describe('drawEraTraffic', () => {
  beforeEach(() => {
    launches.length = 0
  })

  it('launches a rocket from a spaceport named as the sim names it', () => {
    draw(world('spaceport', launchTick(7)))
    expect(launches).toHaveLength(1)
  })

  it('still accepts the normalised name', () => {
    draw(world('Spaceport', launchTick(7)))
    expect(launches).toHaveLength(1)
  })

  it('launches nothing from an unfinished or ruined pad, or from another building', () => {
    const t = launchTick(7)
    draw(world('spaceport', t, { construction_progress: 0.5, condition: 0.5 }))
    draw(world('spaceport', t, { ruined: true }))
    draw(world('factory', t))
    expect(launches).toHaveLength(0)
  })
})
