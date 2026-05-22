use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("pluck lyre of winds");
    ctx.event("life", "pluck lyre of winds");
    0.005
}
