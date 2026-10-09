use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("looking for water to fish");
        return 0.0;
    }
    // A shoal in reach makes the catch: the more fish swim near the line,
    // the more likely a fish is landed, and the net takes one from the shoal.
    let (x, y) = (ctx.org().x, ctx.org().y);
    let school = ctx.sim.fish_school_near(x, y).min(12);
    if ctx.chance(0.20 + 0.04 * school as f32) {
        let o = ctx.org_mut();
        o.inv_food = o.inv_food.saturating_add(1);
        if school > 0 {
            ctx.sim.take_nearest_fish(x, y);
        }
        ctx.think("caught a fish");
        ctx.discover("fishing", "learned to fish");
        0.02
    } else {
        ctx.think("fishing the shallows");
        0.0
    }
}
