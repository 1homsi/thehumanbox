import { vegetationSeason } from '../../landscape-style'
import { groundTint } from '../atmosphere-tint'
import type { CfDriver, CfFrame } from '../frame'
import { DecorDriver } from './decor-driver'
import { MountainsDriver } from './mountains-driver'
import { TerrainWatch } from './terrain-watch'
import { TreesDriver } from './trees-driver'

/**
 * Trees, ground decor and mountains: static sprites rebuilt when the terrain (or
 * season) changes, plus the per-frame wind. The pieces share one terrain watch.
 */
export class VegetationDriver implements CfDriver {
  private readonly watch = new TerrainWatch()
  private readonly decor: DecorDriver
  private readonly mountains: MountainsDriver
  private readonly trees: TreesDriver
  /** Revision each part last built for, so a late atlas image retries without a terrain change. */
  private built = { decor: -1, mountains: -1, trees: -1 }
  private tint = -1
  stats: Record<string, unknown> = {}

  constructor(decor: DecorDriver, mountains: MountainsDriver, trees: TreesDriver) {
    this.decor = decor
    this.mountains = mountains
    this.trees = trees
  }

  update(f: CfFrame): boolean {
    const { world } = f
    const grid = world.grid
    // A hard winter frosts the land beyond an ordinary winter's browns (as the base layer).
    const season = vegetationSeason(
      world.hard_winter && world.season === 'scarcity' ? 'hard_winter' : world.season,
    )
    this.watch.update(grid.tiles, f.biomes, grid.width, grid.height, f.ox, f.oy, season)
    const rev = this.watch.revision
    let changed = false
    if (rev === 0) return false
    if (this.built.mountains !== rev) {
      this.mountains.rebuild(f)
      this.built.mountains = rev
      changed = true
    }
    if (this.built.decor !== rev) {
      this.decor.rebuild(f)
      this.built.decor = rev
      changed = true
    }
    if (this.built.trees !== rev && this.trees.ready()) {
      this.trees.rebuild(f, season)
      this.built.trees = rev
      changed = true
    }
    // Rebuilt sprites start white; the day/night light reaches them as a multiply tint.
    const tint = groundTint(world)
    if (changed || tint !== this.tint) {
      this.tint = tint
      this.decor.applyTint(tint)
      this.mountains.applyTint(tint)
      this.trees.applyTint(tint)
      changed = true
    }
    if (this.trees.update(f)) changed = true
    this.stats = {
      hashMs: this.watch.hashMs,
      revision: rev,
      decor: this.decor.stats,
      mountains: this.mountains.stats,
      trees: this.trees.stats,
    }
    return changed
  }
}
