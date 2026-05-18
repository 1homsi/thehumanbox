
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass) {
        ctx.think("needs open ground for a stall");
        return 0.0;
    }
    let has_mat = ctx.sim.organisms[ctx.idx].inv_wood > 0
        || ctx.sim.organisms[ctx.idx].inv_stone > 0;
    if !has_mat {
        ctx.think("needs materials to build a stall");
        return 0.0;
    }
    ctx.consume_material();
    ctx.think("setting up a market stall");
    ctx.discover("market", "established a market stall");
    ctx.event("build", "built a market stall on open ground");
    0.015
}
