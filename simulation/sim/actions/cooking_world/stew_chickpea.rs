use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("stew chickpea");
    ctx.event("life", "stew chickpea");
    0.005
}
