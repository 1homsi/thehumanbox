use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let fidx = ctx.fidx;
    if !matches!(ctx.tile, Tile::Grass | Tile::Ash) || ctx.sim.grid.fertility[fidx] >= 0.9 {
        return 0.0;
    }
    ctx.sim.grid.fertility[fidx] = (ctx.sim.grid.fertility[fidx] + 0.06).min(0.95);
    ctx.think("composting");
    ctx.discover("composting", "learned composting");
    0.006
}
