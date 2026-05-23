use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("schedule run");
    ctx.event("chore", "scheduled the next still run");
    0.03
}
