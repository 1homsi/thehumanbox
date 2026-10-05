import { vegetationSeason } from '../../landscape-style'
import { terrainSeason } from '../../terrain-season'
import type { CfDriver, CfFrame } from '../frame'
import { DecorDriver } from './decor-driver'
import { MountainsDriver } from './mountains-driver'
import { TreesDriver } from './trees-driver'

/**
 * Trees, ground decor and mountains: static sprites rebuilt when the terrain (or
 * season) changes, plus the per-frame wind. The frame's terrain revision says when.
 */
export class VegetationDriver implements CfDriver {
  private readonly decor: DecorDriver
  private readonly mountains: MountainsDriver
  private readonly trees: TreesDriver
  /** Revision each part last built for, so a late atlas image retries without a terrain change. */
  private built = { decor: -1, mountains: -1, trees: -1 }
  stats: Record<string, unknown> = {}

  constructor(decor: DecorDriver, mountains: MountainsDriver, trees: TreesDriver) {
    this.decor = decor
    this.mountains = mountains
    this.trees = trees
  }

  update(f: CfFrame): boolean {
    const rev = f.terrainRevision
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
      this.trees.rebuild(f, vegetationSeason(terrainSeason(f.world)))
      this.built.trees = rev
      changed = true
    }
    if (this.trees.update(f)) changed = true
    this.stats = {
      revision: rev,
      decor: this.decor.stats,
      mountains: this.mountains.stats,
      trees: this.trees.stats,
    }
    return changed
  }
}
