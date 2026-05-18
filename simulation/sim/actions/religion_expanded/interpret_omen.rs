//! Action 463: interpret an omen from ash or fire.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Ash | Tile::Fire | Tile::Campfire) { return 0.0; }
    ctx.event("ritual", "reading omens in the ash and flame");
    ctx.discover("omen_reading", "learned to interpret omens from fire and ash");
    0.010
}
