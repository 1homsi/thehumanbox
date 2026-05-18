//! Action 210: bless a field. Bumps fertility on grass/food tile.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass | Tile::Food) {
        ctx.think("seeking fields to bless");
        return 0.0;
    }
    let fidx = ctx.fidx;
    ctx.sim.grid.fertility[fidx] = (ctx.sim.grid.fertility[fidx] + 0.05).min(0.97);
    ctx.think("blessing the field");
    ctx.discover("field-blessing", "blessed the fields");
    0.004
}
