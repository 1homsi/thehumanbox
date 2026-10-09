import { useEffect, useLayoutEffect, useState } from 'react'
import { useDynamicCanvas } from 'xipjs'
import { ATLAS_PEOPLE, getPeopleAtlas, loadAtlas } from '../../../shared/sprites'
import {
  BOAT_SIZE,
  EMOTE_SIZE,
  DECAL_SIZE,
  FAUNA_SIZE,
  GLYPH_SIZE,
  PIXEL_FAUNA_SIZE,
  bakeBoats,
  bakeDecals,
  bakeEmotes,
  bakeFauna,
  bakeGlyphs,
  bakePixelFauna,
} from './atlas-bake'
import { HUMAN_ATLAS_HEIGHT, HUMAN_ATLAS_WIDTH } from '../character-visuals'

/** A dynamic canvas drawn once by `bake`; returns its id for a layer atlas's `dynamicSrc`. */
function useBaked(width: number, height: number, bake: (ctx: CanvasRenderingContext2D) => void): string {
  const dyn = useDynamicCanvas(width, height)
  useLayoutEffect(() => {
    bake(dyn.ctx)
    dyn.markDirty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dyn.canvas])
  return dyn.id
}

export const useDecalAtlas = () => useBaked(DECAL_SIZE.width, DECAL_SIZE.height, bakeDecals)
export const useGlyphAtlas = () => useBaked(GLYPH_SIZE.width, GLYPH_SIZE.height, bakeGlyphs)
export const useEmoteAtlas = () => useBaked(EMOTE_SIZE.width, EMOTE_SIZE.height, bakeEmotes)
export const useBoatAtlas = () => useBaked(BOAT_SIZE.width, BOAT_SIZE.height, bakeBoats)
export const usePixelFaunaAtlas = () =>
  useBaked(PIXEL_FAUNA_SIZE.width, PIXEL_FAUNA_SIZE.height, bakePixelFauna)

/** Re-renders once when an image finishes loading. */
function useImageReady(image: HTMLImageElement): boolean {
  const [ready, setReady] = useState(image.complete && image.naturalWidth > 0)
  useEffect(() => {
    if (ready) return
    const done = () => setReady(true)
    if (image.complete && image.naturalWidth > 0) done()
    else image.addEventListener('load', done, { once: true })
    return () => image.removeEventListener('load', done)
  }, [image, ready])
  return ready
}

/** The people sheet: the SVG, rasterised by the canvas painter's own helper, copied into a dynamic canvas. */
export function usePeopleAtlas(): string {
  const ready = useImageReady(ATLAS_PEOPLE)
  const dyn = useDynamicCanvas(HUMAN_ATLAS_WIDTH, HUMAN_ATLAS_HEIGHT)
  useLayoutEffect(() => {
    const raster = ready ? getPeopleAtlas() : null
    if (!raster) return
    dyn.ctx.clearRect(0, 0, dyn.canvas.width, dyn.canvas.height)
    dyn.ctx.drawImage(raster, 0, 0)
    dyn.markDirty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dyn.canvas, ready])
  return dyn.id
}

const FAUNA_URL = `${import.meta.env.BASE_URL}sprites/fauna-v2.png`

/** The fauna sheet cut into one cell per animal. */
export function useFaunaAtlas(): string {
  const sheet = loadAtlas(FAUNA_URL)
  const ready = useImageReady(sheet)
  const dyn = useDynamicCanvas(FAUNA_SIZE.width, FAUNA_SIZE.height)
  useLayoutEffect(() => {
    if (!ready) return
    bakeFauna(dyn.ctx, sheet)
    dyn.markDirty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dyn.canvas, ready])
  return dyn.id
}
