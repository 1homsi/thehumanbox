use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("bisect a bug");
    ctx.event("chore", "bisect a bug");
    0.04
}
