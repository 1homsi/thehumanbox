use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("audit yield");
    ctx.event("chore", "audited yield");
    0.04
}
