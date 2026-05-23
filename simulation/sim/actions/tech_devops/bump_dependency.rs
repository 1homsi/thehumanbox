use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("bump a dependency");
    ctx.event("chore", "bump a dependency");
    0.04
}
