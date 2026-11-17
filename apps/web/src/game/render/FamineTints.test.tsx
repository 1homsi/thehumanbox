// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FamineTints } from './FamineTints'
import { mergeTintSpots, TINT_MERGE_DISTANCE, tintGrowth } from './famine-tint-merge'
import type { WorldState } from '../../shared/types'
import type { MapCamera } from './camera-controls'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

describe('FamineTints', () => {
  it('tints a tribe at risk and one losing people, and no tribe that has died out', () => {
    const world = {
      tick: 500,
      grid: { width: 64, height: 64, origin_x: 0, origin_y: 0 },
      organisms: [
        { id: '1', alive: true, lineage_id: 'risky', energy: 0.1, x: 3, y: 3 },
        { id: '2', alive: true, lineage_id: 'losing', energy: 0.9, x: 9, y: 9 },
        { id: '3', alive: true, lineage_id: 'fed', energy: 0.9, x: 20, y: 20 },
      ],
      settlements: [],
      tribes_in_peril: [{ lineage_id: 'losing', cause: 'hunger' }],
      tribe_losses: {},
      tribe_chronicle: {
        gone: [{ tick: 400, kind: 'extinct', other: null, word: 'starvation', x: 1, y: 1 }],
      },
    } as unknown as WorldState

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push(root)
    const cameraRef = { current: { x: 0, y: 0, zoom: 1 } as MapCamera }
    act(() => root.render(<FamineTints world={world} cameraRef={cameraRef} viewport={{ w: 400, h: 300 }} />))

    const tints = [...host.querySelectorAll('.famine-tint')]
    expect(tints.map((el) => el.className)).toEqual([
      expect.stringContaining('famine-tint-risk'),
      expect.stringContaining('famine-tint-losing'),
    ])
  })
})

describe('merging famine tints', () => {
  it('draws one glow for tribes whose glows would overlap, led by the one losing people', () => {
    const groups = mergeTintSpots(
      [
        { x: 100, y: 100, severity: 1 },
        { x: 130, y: 110, severity: 2 },
        { x: 400, y: 100, severity: 1 },
      ],
      TINT_MERGE_DISTANCE,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({ lead: 1, x: 115, y: 105, count: 2 })
    expect(groups[1]).toEqual({ lead: 2, x: 400, y: 100, count: 1 })
  })

  it('keeps glows apart when the camera is close enough to tell the tribes apart', () => {
    const spread = Array.from({ length: 5 }, (_, i) => ({ x: i * 200, y: 0, severity: 1 }))
    expect(mergeTintSpots(spread, TINT_MERGE_DISTANCE)).toHaveLength(5)
  })

  it('turns a crowd of glows seen from afar into a few, each a little larger but never huge', () => {
    const crowd = Array.from({ length: 150 }, (_, i) => ({
      x: (i % 15) * 20,
      y: Math.floor(i / 15) * 20,
      severity: 1,
    }))
    const groups = mergeTintSpots(crowd, TINT_MERGE_DISTANCE)
    expect(groups.length).toBeLessThan(20)
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(150)
    expect(tintGrowth(1)).toBe(1)
    expect(tintGrowth(4)).toBe(1.5)
    expect(tintGrowth(1000)).toBe(1.8)
  })
})
