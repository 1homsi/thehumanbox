import { useEffect, useRef } from 'react'
import type { WorldState } from '../../shared/types'
import { TILE } from '../../game/model/palette'
import { readSavedCamera } from '../../game/model/saved-camera'
import { tribeHome } from '../../game/model/tribe-peril'
import { useCameraFocus } from '../../state/camera-focus'
import { largestTribe } from './opening-lines'

/** How close the first look sits: people and their work readable on a phone as on a desktop. */
export const FIRST_LOOK_ZOOM = 3
/** After this long with no one to look at, the map keeps the whole-world view the player may already be using. */
const FIRST_LOOK_WAIT_MS = 5_000

/**
 * The first view of a world the player has no saved camera for: close on its largest tribe, rather than the whole
 * map, where people are specks. Runs once per page load; a saved camera (a returning player) is left alone.
 */
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
    const home = tribe ? tribeHome(world, tribe) : null
    if (!home) return
    done.current = true
    useCameraFocus.getState().focusTile(Math.round(home.x), Math.round(home.y), FIRST_LOOK_ZOOM)
  }, [world])
  return null
}
