import { useEffect, useRef } from 'react'
import type { WorldState } from '../../shared/types'
import { openingTarget } from '../../game/model/first-look'
import { TILE } from '../../game/model/palette'
import { readSavedCamera } from '../../game/model/saved-camera'
import { useCameraFocus } from '../../state/camera-focus'
import { useFirstLook } from '../../state/first-look'

export const FIRST_LOOK_ZOOM = 3
const FIRST_LOOK_WAIT_MS = 5_000

/**
 * A new world's camera opens close on the tribe most likely to do something soon (see openingTarget) rather
 * than on the whole map. A world loaded from a save, or one the player has already looked around, keeps the
 * camera where it was.
 */
export function FirstLook({ world, resumed = false }: { world: WorldState | null; resumed?: boolean }) {
  const state = useRef<{ fresh: boolean; since: number } | null>(null)
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !world) return
    if (!state.current) {
      const size = { w: world.grid.width * TILE, h: world.grid.height * TILE }
      state.current = { fresh: !resumed && readSavedCamera(size) === null, since: Date.now() }
    }
    if (!state.current.fresh || Date.now() - state.current.since > FIRST_LOOK_WAIT_MS) {
      done.current = true
      return
    }
    const target = openingTarget(world)
    if (!target) return
    done.current = true
    useFirstLook.setState({ tribe: target.tribe })
    useCameraFocus.getState().focusTile(target.x, target.y, FIRST_LOOK_ZOOM)
  }, [world, resumed])
  return null
}
