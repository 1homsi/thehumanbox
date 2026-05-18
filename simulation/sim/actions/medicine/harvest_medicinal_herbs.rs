//! Action 249: on Food tile, gather herbs; discover "medicinal_herbs".
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food | Tile::Grass) {
        ctx.think("no herbs here");
        return 0.0;
    }
    ctx.sim.organisms[ctx.idx].inv_food = ctx.sim.organisms[ctx.idx].inv_food.saturating_add(1);
    ctx.think("harvesting medicinal herbs");
    ctx.discover("medicinal_herbs", "harvested medicinal herbs from the wild");
    0.010
}
