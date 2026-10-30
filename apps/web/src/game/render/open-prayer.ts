import type { PrayerInfo } from '../../shared/types'
import { useCameraFocus } from '../../state/camera-focus'
import { useUIStore } from '../../state/store'

/**
 * A click on a prayer bubble on the map opens that tribe's card, where its prayer and the "help" button
 * sit (see TribeCard), and turns the camera to the tribe. Answering stays one more click, on that button.
 */
export function openPrayerOnMap(prayer: PrayerInfo): void {
  useCameraFocus.getState().focusTile(prayer.x, prayer.y)
  useUIStore.getState().setFocus(`lineage:${prayer.lineage_id}`)
}
