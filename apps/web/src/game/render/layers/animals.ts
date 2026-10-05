import { _animalLastPos, drawCanineSprite } from '.././draw-helpers'
import { animalBob, animalMoving, animalSize, animalStep, isFlyer } from '.././animal-visuals'

import { drawFaunaSprite } from '.././fauna-sprites'
import { drawPixelFauna } from '.././pixel-fauna'

import { pickAnimalTile, ATLAS_CREATURE, drawTile } from '../../../shared/sprites'

import { characterMotion } from '.././character-visuals'
import { TILE } from '../../model/palette'

import type { DrawFrame } from './frame'

/** Wild animals and monsters (the 2D fallback). */
export function draw_animals(f: DrawFrame) {
  const { ctx, viewFlags, ox, oy, r0, r1, c0, c1, animals, t } = f
  if (viewFlags.animals && animals.length > 0) {
    ctx.save()
    const atlasReady = ATLAS_CREATURE.complete && ATLAS_CREATURE.naturalWidth > 0
    if (_animalLastPos.size > Math.max(256, animals.length * 3)) {
      const visibleIds = new Set(animals.map((animal) => animal.id))
      for (const id of _animalLastPos.keys()) {
        if (!visibleIds.has(id)) _animalLastPos.delete(id)
      }
    }
    // Sleeping animals get a drifting 'z', drawn over every sprite.
    const sleepers: [number, number, number][] = []
    for (const animal of [...animals].sort((a, b) => a.y - b.y || a.id - b.id)) {
      if (animal.away) continue
      if (
        animal.x - ox < c0 - 3 ||
        animal.x - ox > c1 + 3 ||
        animal.y - oy < r0 - 3 ||
        animal.y - oy > r1 + 3
      )
        continue
      const motion = characterMotion(_animalLastPos.get(animal.id), animal.x, animal.y, t, 0)
      _animalLastPos.set(animal.id, motion)
      const flyer = isFlyer(animal.kind)
      const size = animalSize(animal.kind)
      const moving = animalMoving(animal.kind, t, motion.movedAt)
      const yOff = animalBob(animal.kind, animal.id, moving, t)
      const cx = (animal.x - ox) * TILE + TILE / 2
      const cy = (animal.y - oy) * TILE + TILE / 2 + yOff
      if (animal.kind !== 'fish' && animal.kind !== 'bird') {
        // Flyers cast a smaller, fainter shadow further below them.
        ctx.fillStyle = flyer ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(
          cx,
          cy + size * (flyer ? 0.9 : 0.42),
          size * (flyer ? 0.24 : 0.32),
          size * (flyer ? 0.1 : 0.14),
          0,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      if (animal.sleeping) sleepers.push([cx, cy - size * 0.55, animal.id])
      const flip = motion.flipped
      const step = animalStep(animal.id, moving, t)
      if (drawPixelFauna(ctx, animal.kind, cx, cy, size, flip, step)) continue
      if (drawFaunaSprite(ctx, animal.kind, animal.id, cx, cy, size, flip)) continue
      if (animal.kind === 'wolf' || animal.kind === 'dog') {
        drawCanineSprite(
          ctx,
          cx,
          cy,
          size,
          animal.kind,
          flip,
          moving ? Math.floor(t / 220 + animal.id) & 1 : 0,
        )
      } else if (atlasReady) {
        // Tiny Creatures is a catalogue, not an animation strip. Keep each
        // animal on one deterministic variant so deer never morph into boar.
        const tile = pickAnimalTile(animal.kind, animal.id)
        const dx = Math.round(cx - size / 2)
        const dy = Math.round(cy - size / 2)
        if (!tile) {
          continue
        } else if (flip) {
          ctx.save()
          ctx.translate(dx + size, 0)
          ctx.scale(-1, 1)
          drawTile(ctx, ATLAS_CREATURE, tile, 0, dy, size)
          ctx.restore()
        } else {
          drawTile(ctx, ATLAS_CREATURE, tile, dx, dy, size)
        }
      } else {
        ctx.fillStyle = animal.kind === 'fish' ? '#6f9fb0' : '#8a6a4a'
        ctx.beginPath()
        ctx.ellipse(cx, cy, size * 0.32, size * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    for (const [zx, zy, id] of sleepers) {
      const rise = ((t / 1800 + id * 0.37) % 1) * 6
      ctx.globalAlpha = 0.85 - rise / 10
      ctx.font = 'bold 7px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#e8eef8'
      ctx.fillText('z', zx + rise * 0.6, zy - rise)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }
}
