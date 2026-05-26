use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food | Tile::Grass) {
        ctx.think("need fertile land for a herb garden");
        return 0.0;
    }
    ctx.think("planning a herb garden");
    ctx.discover("herb_garden", "identified a site for a medicinal herb garden");
    0.015
}
