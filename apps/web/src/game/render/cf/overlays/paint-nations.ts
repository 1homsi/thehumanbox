import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { nationChunks, nationColour, type NationChunks } from '../../../model/nations'

let cached: { territory: unknown; nations: unknown; chunks: NationChunks } | null = null

export function nationChunksFor(world: Pick<WorldState, 'nations' | 'territory'>): NationChunks {
  if (cached && cached.territory === world.territory && cached.nations === world.nations) return cached.chunks
  const chunks = nationChunks(world, TILE)
  cached = { territory: world.territory, nations: world.nations, chunks }
  return chunks
}

export function paintNationBorders(ctx: CanvasRenderingContext2D, world: WorldState): void {
  if (!world.nations?.length || !world.territory) return
  const dx = -(world.grid.origin_x ?? 0) * TILE
  const dy = -(world.grid.origin_y ?? 0) * TILE
  for (const paints of nationChunksFor(world).values()) {
    for (const paint of paints) {
      ctx.fillStyle = nationColour(paint.colour, 0.12)
      for (let i = 0; i < paint.tint.length; i += 4)
        ctx.fillRect(paint.tint[i]! + dx, paint.tint[i + 1]! + dy, paint.tint[i + 2]!, paint.tint[i + 3]!)
      ctx.fillStyle = nationColour(paint.colour, 0.85)
      for (let i = 0; i < paint.edge.length; i += 4)
        ctx.fillRect(paint.edge[i]! + dx, paint.edge[i + 1]! + dy, paint.edge[i + 2]!, paint.edge[i + 3]!)
    }
  }
}
