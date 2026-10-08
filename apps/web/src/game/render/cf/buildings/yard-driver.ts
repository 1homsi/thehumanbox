import { SPRITE_UNTEXTURED, type SpriteLayer } from 'cubeforge'
import type { CfDriver, CfFrame } from '../frame'
import { writeSprite } from '../frame'
import { yardRects } from './yard-marks'

/**
 * The home yards (garden plot, sprouts, picket fence) as untextured rectangles. They are laid
 * under the buildings and rebuilt only when the set of buildings or the grid origin changes, so
 * a village with a few hundred homes costs nothing per frame.
 */
export class YardDriver implements CfDriver {
  stats = { yards: 0, rebuilds: 0 }
  private readonly layer: SpriteLayer
  private key = ''

  constructor(layer: SpriteLayer) {
    this.layer = layer
  }

  update(f: CfFrame): boolean {
    const buildings = f.world.buildings
    if (!buildings || buildings.length === 0) {
      if (this.layer.count === 0) return false
      this.layer.clear()
      this.layer.touch()
      this.key = ''
      return true
    }
    const key = `${buildings.length}|${f.ox}|${f.oy}`
    if (key === this.key) return false
    this.key = key
    const rects = yardRects(buildings, f.ox, f.oy)
    const layer = this.layer
    layer.resize(rects.length)
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      writeSprite(layer, i, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0, 0, r.colour, SPRITE_UNTEXTURED, -1, 0)
    }
    layer.touch()
    this.stats = { yards: rects.length, rebuilds: this.stats.rebuilds + 1 }
    return true
  }
}
