use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass) {
        return 0.0;
    }
    ctx.think("plowing the field");
    ctx.discover("plowing", "broke the first ground for farming");
    ctx.event("build", "plowed a field for cultivation");
    0.008
}
