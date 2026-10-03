use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.chance(0.2) {
        ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
    }
    ctx.add_comfort(0.01);
    ctx.think("pick up a leaf");
    ctx.event("chore", "pick up a leaf");
    0.03
}
