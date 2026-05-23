use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("cuts", 1) {
        ctx.think("no primals to cut");
        return 0.005;
    }
    ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
    ctx.think("brisket");
    ctx.event("chore", "cut brisket");
    0.05
}
