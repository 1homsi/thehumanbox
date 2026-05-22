use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("simmer goulash");
    ctx.event("life", "simmer goulash");
    0.005
}
