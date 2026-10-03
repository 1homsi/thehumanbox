use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("rebase a branch");
    ctx.event("chore", "rebase a branch");
    0.04
}
