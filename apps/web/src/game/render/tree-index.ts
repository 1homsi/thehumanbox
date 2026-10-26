import { SPRITE } from '../../shared/sprites'
import type { TreeKind } from '../model/map-things'
import { TILE } from '../model/palette'
import type { PlacedAcacia, PlacedTree } from './decorations'

const KIND_OF_SPRITE = new Map<unknown, TreeKind>([
  [SPRITE.trees.oak_dark, 'tree'],
  [SPRITE.trees.oak_mid, 'tree'],
  [SPRITE.trees.oak_light, 'tree'],
  [SPRITE.trees.autumn_red, 'tree'],
  [SPRITE.trees.autumn_yel, 'tree'],
  [SPRITE.trees.conifer, 'conifer'],
  [SPRITE.trees.conifer_dk, 'conifer'],
  [SPRITE.trees.bush, 'bush'],
  [SPRITE.trees.dead, 'dead'],
  [SPRITE.trees.cactus, 'cactus'],
])

/** The tile each placed tree stands on, keyed by grid index (row * width + column), from the last placement. */
let kindByCell = new Map<number, TreeKind>()
let indexWidth = 0
/** The world tile of the grid's top-left corner the placement was made for. */
let indexOrigin = { x: 0, y: 0 }

/**
 * Remembers where the trees were placed (the trees driver calls this whenever it places them), so the
 * hover card can name the tree under the pointer. Placement is deterministic, so the index only
 * changes when the terrain or the season does.
 */
export function indexTrees(
  trees: PlacedTree[],
  acacias: PlacedAcacia[],
  width: number,
  origin: { x: number; y: number },
): void {
  const next = new Map<number, TreeKind>()
  for (const tree of trees) {
    // A tree's crown is centred in its tile, so the middle of the crown names the tile.
    const col = Math.floor((tree.cx + tree.sz / 2) / TILE)
    const row = Math.floor((tree.cy + tree.sz / 2) / TILE)
    next.set(row * width + col, KIND_OF_SPRITE.get(tree.sprite) ?? 'tree')
  }
  for (const acacia of acacias) {
    // An acacia stands on its base, which is the bottom edge of its tile.
    const col = Math.floor(acacia.x / TILE)
    const row = Math.floor((acacia.y - TILE / 2) / TILE)
    next.set(row * width + col, 'acacia')
  }
  kindByCell = next
  indexWidth = width
  indexOrigin = { x: origin.x, y: origin.y }
}

/** The kind of tree standing on the tile under a world point (in tiles), or null for none. */
export function treeKindAt(worldX: number, worldY: number): TreeKind | null {
  if (kindByCell.size === 0) return null
  const col = Math.floor(worldX) - indexOrigin.x
  const row = Math.floor(worldY) - indexOrigin.y
  if (col < 0 || row < 0 || col >= indexWidth) return null
  return kindByCell.get(row * indexWidth + col) ?? null
}
