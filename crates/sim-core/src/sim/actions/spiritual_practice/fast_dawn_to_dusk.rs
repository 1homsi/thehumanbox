use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("fast dawn to dusk");
    ctx.event("life", "fast dawn to dusk");
    0.005
}
