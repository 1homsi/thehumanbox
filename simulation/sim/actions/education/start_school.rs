
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Hut) { return 0.0; }
    if ctx.kin.len() < 2 { return 0.0; }
    ctx.think("establishing a place where knowledge will be shared");
    ctx.discover("school", "founded the first school for the tribe");
    ctx.event("build", "a school is established in the communal hut");
    0.015
}
