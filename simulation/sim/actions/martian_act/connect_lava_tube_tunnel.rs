use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("connect lava tube tunnel");
    ctx.event("life", "connect lava tube tunnel");
    0.005
}
