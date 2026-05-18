
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick >= 3000 { return 0.0; }
    if !matches!(ctx.tile, Tile::Hut) { return 0.0; }
    ctx.think("cleaning the dwelling after the long winter");
    ctx.discover("seasonal_hygiene", "cleaned and refreshed the home at spring's start");
    ctx.event("build", "spring cleaning of the communal dwelling");
    0.007
}
