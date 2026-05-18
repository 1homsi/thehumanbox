
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food) { return 0.0; }
    ctx.org_mut().energy = (ctx.org().energy + 0.02).min(1.0);
    ctx.think("tending crops");
    0.004
}
