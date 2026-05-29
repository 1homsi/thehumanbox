use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.10).max(0.0);
    ctx.think("studying the world");
    if ctx.chance(0.04) {
        ctx.discover("scholarship", "valued knowledge");
    }
    0.003
}
