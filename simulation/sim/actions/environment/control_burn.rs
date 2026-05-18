
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near || !matches!(ctx.tile, Tile::Grass) {
        ctx.think("wrong conditions for a controlled burn");
        return 0.0;
    }
    ctx.think("setting a careful, directed burn");
    ctx.discover("controlled_burn", "used fire deliberately to renew the land");
    ctx.event("build", "conducted a controlled burn to clear undergrowth and enrich soil");
    0.010
}
