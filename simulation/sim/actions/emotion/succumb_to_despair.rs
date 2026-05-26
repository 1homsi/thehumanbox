use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().health > 0.3 || ctx.org().comfort > 0.2 {
        ctx.think("holding on");
        return 0.0;
    }
    ctx.org_mut().energy = (ctx.org().energy - 0.03).max(0.0);
    ctx.think("lost");
    ctx.event("emotion", "succumbed to despair, drained of all hope");
    0.002
}
