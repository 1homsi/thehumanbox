use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("approve a pull request");
    ctx.event("chore", "approve a pull request");
    0.04
}
