use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("grade size");
    ctx.event("chore", "graded sizes");
    0.03
}
