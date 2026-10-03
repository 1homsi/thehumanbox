use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("shadow traffic");
    ctx.event("chore", "shadow traffic");
    0.05
}
