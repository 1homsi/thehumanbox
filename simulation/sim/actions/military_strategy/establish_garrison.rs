use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let hut_near = matches!(ctx.tile, Tile::Hut);
    if !hut_near && !ctx.rock_near {
        return 0.0;
    }
    ctx.event("build", "establishing a garrison at a defensive position");
    ctx.discover("garrison", "set up the first permanent garrison");
    0.040
}
