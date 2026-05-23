use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("squash commits");
    ctx.event("chore", "squash commits");
    0.04
}
