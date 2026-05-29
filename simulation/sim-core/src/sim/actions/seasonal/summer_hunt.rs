use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick < 3000 || season_tick >= 6000 {
        return 0.0;
    }
    ctx.org_mut().inv_food = ctx.org_mut().inv_food.saturating_add(1);
    ctx.think("hunting in the long summer days");
    ctx.discover("summer_hunting", "organized a summer hunting expedition");
    ctx.event("build", "summer hunt yields fresh provisions");
    0.010
}
