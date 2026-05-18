
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass | Tile::Food) {
        ctx.think("seeking new plants");
        return 0.0;
    }
    ctx.think("cataloguing plants");
    ctx.discover("botany", "began cataloguing plants");
    0.004
}
