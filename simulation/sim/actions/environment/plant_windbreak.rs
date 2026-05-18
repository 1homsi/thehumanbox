//! Action 371: plant a windbreak. Needs inv_wood and a Grass tile.
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 || !matches!(ctx.tile, Tile::Grass) {
        ctx.think("no wood or wrong ground");
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("planting windbreak");
    ctx.discover("windbreak", "planted a windbreak to shelter the land");
    ctx.event("build", "planted a row of trees as a windbreak");
    0.007
}
