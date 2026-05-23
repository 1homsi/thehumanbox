use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_water = ctx.org().inv_water.saturating_add(1);
    ctx.think("refill water");
    ctx.event("chore", "refilled water");
    0.03
}
