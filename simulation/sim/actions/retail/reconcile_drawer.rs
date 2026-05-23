use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("reconcile drawer");
    ctx.event("chore", "reconcile drawer");
    0.04
}
