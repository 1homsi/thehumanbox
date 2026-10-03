use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if !(3000..6000).contains(&season_tick) {
        return 0.0;
    }
    if ctx.catch_small_prey(8.0) == 0 {
        ctx.think("the summer hunt found nothing");
        return 0.0;
    }
    ctx.think("hunting in the long summer days");
    ctx.discover("summer_hunting", "organized a summer hunting expedition");
    ctx.event("build", "summer hunt yields fresh provisions");
    0.010
}
