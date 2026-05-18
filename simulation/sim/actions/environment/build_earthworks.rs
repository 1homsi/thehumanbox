//! Action 385: build earthworks. Needs inv_stone and a Grass tile.
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 || !matches!(ctx.tile, Tile::Grass) {
        ctx.think("need stone and open ground");
        return 0.0;
    }
    ctx.org_mut().inv_stone -= 1;
    ctx.think("raising earth and stone into berms");
    ctx.discover("earthworks", "constructed earthworks to shape and protect the landscape");
    ctx.event("build", "raised earthen embankments to control water and define territory");
    0.010
}
