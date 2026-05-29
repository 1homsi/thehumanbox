use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("drape skirt");
    ctx.event("chore", "draped the skirt");
    0.03
}
