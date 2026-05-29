use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("drape collar");
    ctx.event("chore", "draped the collar");
    0.03
}
