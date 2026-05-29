use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().energy = (ctx.org().energy - 0.01).max(0.0);
    ctx.think("refuse food");
    ctx.event("chore", "refused food");
    0.01
}
