use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("block pattern");
    ctx.event("chore", "blocked a pattern");
    0.03
}
