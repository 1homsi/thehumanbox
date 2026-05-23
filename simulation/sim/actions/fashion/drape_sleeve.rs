use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("drape sleeve");
    ctx.event("chore", "draped the sleeve");
    0.03
}
