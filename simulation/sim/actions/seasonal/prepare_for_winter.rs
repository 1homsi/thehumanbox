use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick >= 9000 || ctx.org().inv_food >= 5 {
        ctx.think("already stocked for winter");
        return 0.003;
    }
    if ctx.org().inv_food == 0 {
        return 0.0;
    }
    ctx.think("storing food for the cold months ahead");
    ctx.discover("winter_preparation", "prepared food stores for the coming winter");
    ctx.event("build", "stockpiling provisions before winter arrives");
    0.010
}
