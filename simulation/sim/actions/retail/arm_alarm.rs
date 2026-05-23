use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.005);
    ctx.think("arm alarm");
    ctx.event("chore", "armed the alarm");
    0.03
}
