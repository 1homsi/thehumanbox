//! Action 352: plant an herb garden on grass.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass) { return 0.0; }
    ctx.think("planting an herb garden");
    ctx.discover("herb_garden", "cultivated the first herb garden");
    ctx.event("build", "planted a garden of medicinal and culinary herbs");
    0.008
}
