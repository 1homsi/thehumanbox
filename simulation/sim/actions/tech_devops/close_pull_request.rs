use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("close a pull request");
    ctx.event("chore", "close a pull request");
    0.04
}
