use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().fear_level = (ctx.org().fear_level - 0.04).max(0.0);
    ctx.think("retracing my steps");
    0.002
}
