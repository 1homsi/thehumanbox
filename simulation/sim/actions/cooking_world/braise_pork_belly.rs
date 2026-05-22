use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("braise pork belly");
    ctx.event("life", "braise pork belly");
    0.005
}
