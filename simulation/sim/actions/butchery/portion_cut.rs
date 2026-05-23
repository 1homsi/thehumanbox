use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("cuts", 1) {
        ctx.think("nothing to portion");
        return 0.005;
    }
    ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(2);
    ctx.think("portion cut");
    ctx.event("chore", "portioned the cuts");
    0.06
}
