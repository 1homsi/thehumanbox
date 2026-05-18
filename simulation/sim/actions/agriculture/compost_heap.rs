//! Action 354: create a compost heap on ash or grass.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Ash | Tile::Grass) { return 0.0; }
    ctx.think("building a compost heap");
    ctx.discover("composting", "started composting organic waste");
    ctx.event("build", "established a compost heap to enrich the soil");
    0.007
}
