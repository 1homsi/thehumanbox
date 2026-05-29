use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("measure customer");
    ctx.event("chore", "took measurements");
    0.03
}
