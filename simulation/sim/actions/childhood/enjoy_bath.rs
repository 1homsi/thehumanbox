use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.025);
    ctx.think("enjoy a bath");
    ctx.event("chore", "enjoy a bath");
    0.03
}
