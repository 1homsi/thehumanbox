import { memo, useEffect, useRef, useSyncExternalStore } from 'react'
import {
  HUMAN_FEET_ROW,
  HUMAN_HEIGHT,
  deterministicAppearanceIndex,
  resolveAgeStage,
  type CharacterAge,
} from '../../../game/render/character-visuals'
import { getPeopleAtlas, onAnyAtlasLoaded, pickHumanSprite, PEOPLE_CELL } from '../../../shared/sprites'

const CROP = 16

let atlasVersion = 0
const atlasListeners = new Set<() => void>()
let watching = false

function subscribeAtlas(listener: () => void) {
  if (!watching) {
    watching = true
    onAnyAtlasLoaded(() => {
      atlasVersion += 1
      for (const fn of atlasListeners) fn()
    })
  }
  atlasListeners.add(listener)
  return () => {
    atlasListeners.delete(listener)
  }
}

const readAtlasVersion = () => atlasVersion

interface PortraitPerson extends CharacterAge {
  id: string
  sex?: string
}

export const Portrait = memo(function Portrait({
  person,
  size = 32,
}: {
  person: PortraitPerson
  size?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const version = useSyncExternalStore(subscribeAtlas, readAtlasVersion, readAtlasVersion)
  const stage = resolveAgeStage(person)
  const sex = person.sex === 'female' ? 'female' : 'male'

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext?.('2d')
    const atlas = getPeopleAtlas()
    if (!el || !ctx || !atlas) return
    const [col, row] = pickHumanSprite(sex, stage, 0, deterministicAppearanceIndex(person.id))
    const top = Math.max(0, HUMAN_FEET_ROW - Math.max(HUMAN_HEIGHT[stage], 12) - 2)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      atlas,
      col * PEOPLE_CELL + (PEOPLE_CELL - CROP) / 2,
      row * PEOPLE_CELL + top,
      CROP,
      CROP,
      0,
      0,
      CROP,
      CROP,
    )
  }, [person.id, sex, stage, version])

  return (
    <canvas
      ref={canvas}
      className="person-portrait"
      width={CROP}
      height={CROP}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
})
