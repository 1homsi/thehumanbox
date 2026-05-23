use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("lock dependencies");
    ctx.event("chore", "lock dependencies");
    0.04
}
