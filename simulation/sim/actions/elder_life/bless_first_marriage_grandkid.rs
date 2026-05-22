use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("bless first marriage grandkid");
    ctx.event("life", "bless first marriage grandkid");
    0.005
}
