//! Action 337: sow seeds into prepared or food-rich ground.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass | Tile::Food) { return 0.0; }
    if ctx.chance(0.5) {
        ctx.org_mut().inv_food += 1;
    }
    ctx.think("sowing seeds");
    ctx.event("build", "scattered seeds across the field");
    0.006
}
