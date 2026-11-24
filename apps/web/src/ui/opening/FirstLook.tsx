import { useEffect, useRef } from 'react'
import type { WorldState } from '../../shared/types'
import { firstLookFocus } from '../../game/model/first-look'
import { TILE } from '../../game/model/palette'
import { readSavedCamera } from '../../game/model/saved-camera'
import { tribeHome } from '../../game/model/tribe-peril'
import { useCameraFocus } from '../../state/camera-focus'
import { largestTribe } from './opening-lines'

export const FIRST_LOOK_ZOOM = 3
const FIRST_LOOK_WAIT_MS = 5_000

export function FirstLook({ world }: { world: WorldState | null }) {
  const state = useRef<{ fresh: boolean; since: number } | null>(null)
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !world) return
    if (!state.current) {
      const size = { w: world.grid.width * TILE, h: world.grid.height * TILE }
      state.current = { fresh: readSavedCamera(size) === null, since: Date.now() }
    }
    if (!state.current.fresh || Date.now() - state.current.since > FIRST_LOOK_WAIT_MS) {
      done.current = true
      return
    }
    const tribe = largestTribe(world)
    // A group about to do something visible, or the largest tribe when none qualifies.
    const home = firstLookFocus(world) ?? (tribe ? tribeHome(world, tribe) : null)
    if (!home) return
    done.current = true
    useCameraFocus.getState().focusTile(Math.round(home.x), Math.round(home.y), FIRST_LOOK_ZOOM)
  }, [world])
  return null
}
