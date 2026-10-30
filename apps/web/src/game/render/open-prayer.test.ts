import { describe, expect, it } from 'vitest'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'
import { openPrayerOnMap } from './open-prayer'

describe('openPrayerOnMap', () => {
  it('a click on a prayer bubble opens that tribe and turns the camera to where it prays', () => {
    useUIStore.getState().setFocus('all')
    openPrayerOnMap({
      id: 7,
      lineage_id: 'l9',
      tribe: 'The Blues',
      kind: 'hunger',
      x: 3,
      y: 4,
      created: 0,
      expires: 10,
    })
    expect(useUIStore.getState().focus).toBe('lineage:l9')
    expect(useCameraFocus.getState().request).toMatchObject({ x: 3, y: 4 })
  })
})
