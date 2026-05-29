use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("monitor alien microbiome");
    ctx.event("life", "monitor alien microbiome");
    0.005
}
