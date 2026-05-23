use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("label pattern");
    ctx.event("chore", "labeled a pattern");
    0.03
}
