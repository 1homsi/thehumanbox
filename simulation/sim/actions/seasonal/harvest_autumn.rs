
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick < 6000 || season_tick >= 9000 { return 0.0; }
    if !matches!(ctx.tile, Tile::Food) { return 0.0; }
    ctx.org_mut().inv_food += 2;
    ctx.think("gathering the autumn harvest");
    ctx.discover("autumn_harvest", "harvested a bountiful autumn crop");
    0.012
}
