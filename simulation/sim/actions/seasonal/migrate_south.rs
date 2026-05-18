
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick < 9000 { return 0.0; }
    ctx.think("leading the tribe south for winter");
    ctx.discover("seasonal_migration", "led the group on a seasonal migration");
    ctx.event("social", "the tribe migrates south to escape the winter cold");
    0.012
}
