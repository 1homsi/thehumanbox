use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("revert a commit");
    ctx.event("chore", "revert a commit");
    0.04
}
