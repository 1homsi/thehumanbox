use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("audit extraction");
    ctx.event("chore", "audited extraction");
    0.04
}
