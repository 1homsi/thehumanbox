use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("audit a dependency");
    ctx.event("chore", "audit a dependency");
    0.04
}
