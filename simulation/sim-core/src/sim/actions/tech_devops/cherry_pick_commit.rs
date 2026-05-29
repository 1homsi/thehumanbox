use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("cherry-pick a commit");
    ctx.event("chore", "cherry-pick a commit");
    0.04
}
