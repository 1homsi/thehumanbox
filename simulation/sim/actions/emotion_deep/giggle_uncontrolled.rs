use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("giggle uncontrolled");
    ctx.event("life", "giggle uncontrolled");
    0.005
}
