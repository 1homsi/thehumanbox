use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("review a pull request");
    ctx.event("chore", "review a pull request");
    0.04
}
