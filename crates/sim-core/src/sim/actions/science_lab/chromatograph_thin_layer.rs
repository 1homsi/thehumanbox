use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("chromatograph thin layer");
    ctx.event("life", "chromatograph thin layer");
    0.005
}
