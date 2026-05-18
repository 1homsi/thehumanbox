//! Action 473: plant crops in spring on Grass tile; inv_food += 1; discover "spring_planting".
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick >= 3000 { return 0.0; }
    if !matches!(ctx.tile, Tile::Grass) { return 0.0; }
    ctx.org_mut().inv_food += 1;
    ctx.think("planting seeds in the spring soil");
    ctx.discover("spring_planting", "planted the first spring crop");
    ctx.event("build", "sowed seeds in fertile ground at the start of spring");
    0.010
}
