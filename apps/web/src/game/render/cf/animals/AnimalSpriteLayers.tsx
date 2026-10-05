import { useEffect, useMemo, useRef } from 'react'
import { useGame, useSpriteLayer } from 'cubeforge'
import type { WorldState } from '../../../../shared/types'
import type { InterpRefs } from '../../../../simulation/useSimulation'
import type { ViewFlags } from '../../../../state/store'
import { useDecalAtlas, useFaunaAtlas, useGlyphAtlas, usePixelFaunaAtlas } from '../atlas-hooks'
import { DECAL_CELL, FAUNA_CELL, GLYPH_CELL, PIXEL_FAUNA_CELL } from '../atlas-bake'
import { useSpriteClock, wakeEngine } from '../frame-clock'
import { AnimalSprites } from './animal-sprites'
import { ANIMAL_Z } from '../people/z-order'

interface Props {
  world: WorldState
  interp?: InterpRefs
  viewFlags: ViewFlags
  rendererPaused: boolean
}

/** Wild animals and monsters drawn by SpriteLayers instead of the canvas painter's `draw_animals`. */
export function AnimalSpriteLayers({ world, interp, viewFlags, rendererPaused }: Props) {
  const engine = useGame()
  const pixelAtlas = usePixelFaunaAtlas()
  const faunaAtlas = useFaunaAtlas()
  const decalAtlas = useDecalAtlas()
  const glyphAtlas = useGlyphAtlas()

  const bodyAtlases = useMemo(
    () => [
      { dynamicSrc: pixelAtlas, frameWidth: PIXEL_FAUNA_CELL, frameHeight: PIXEL_FAUNA_CELL },
      { dynamicSrc: faunaAtlas, frameWidth: FAUNA_CELL, frameHeight: FAUNA_CELL },
    ],
    [pixelAtlas, faunaAtlas],
  )
  const decalAtlases = useMemo(
    () => [{ dynamicSrc: decalAtlas, frameWidth: DECAL_CELL, frameHeight: DECAL_CELL }],
    [decalAtlas],
  )
  const glyphAtlases = useMemo(
    () => [{ dynamicSrc: glyphAtlas, frameWidth: GLYPH_CELL, frameHeight: GLYPH_CELL }],
    [glyphAtlas],
  )
  const body = useSpriteLayer({
    atlases: bodyAtlases,
    sortByKey: true,
    zIndex: ANIMAL_Z.body,
    sampling: 'nearest',
  })
  const shadow = useSpriteLayer({ atlases: decalAtlases, zIndex: ANIMAL_Z.shadow, sampling: 'linear' })
  const sleep = useSpriteLayer({ atlases: glyphAtlases, zIndex: ANIMAL_Z.sleep, sampling: 'linear' })
  const sprites = useMemo(() => new AnimalSprites({ body, shadow, sleep }), [body, shadow, sleep])

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const shown = viewFlags.animals
  const last = useRef<{ animals: unknown; prev: unknown; shown: boolean } | null>(null)
  const lastAnimate = useRef(0)

  useEffect(() => {
    // The layer is new: the next frame must rebuild it.
    last.current = null
  }, [sprites])

  useSpriteClock(interp, world, rendererPaused, (frame) => {
    const w = frame.world
    const pick = (x: WorldState) =>
      x.viewport_animals && x.viewport_animals.length > 0 ? x.viewport_animals : (x.animals ?? [])
    const animals = shown ? pick(w) : []
    const prevAnimals = frame.prev && shown ? pick(frame.prev) : null
    const l = last.current
    if (!l || l.animals !== animals || l.prev !== prevAnimals || l.shown !== shown) {
      sprites.rebuild({ animals, prevAnimals, ox, oy })
      last.current = { animals, prev: prevAnimals, shown }
    }
    // Fish and birds bob forever; settled scenery only needs every other display frame.
    if (frame.t >= 1 && frame.now - lastAnimate.current < 33) return
    lastAnimate.current = frame.now
    sprites.animate(frame.now, frame.t)
    wakeEngine(engine)
  })

  return null
}
