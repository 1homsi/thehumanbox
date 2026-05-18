//! Action 60: cook food on fire. Big energy gain, consumes the
//! Food tile (back to Grass).

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || !matches!(ctx.tile, Tile::Food) {
        ctx.think("preparing a meal");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.energy = (o.energy + 0.30).min(1.0);
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.set(ix, iy, Tile::Grass);
    ctx.think("cooking food");
    ctx.discover("cooking", "learned to cook");
    0.02
}
