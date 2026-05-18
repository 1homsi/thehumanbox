//! Action 340: harvest grain from a food tile.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food) { return 0.0; }
    ctx.org_mut().inv_food += 2;
    ctx.think("harvesting grain");
    ctx.discover("grain_harvest", "harvested grain for the first time");
    ctx.event("build", "gathered a grain harvest from the field");
    0.010
}
