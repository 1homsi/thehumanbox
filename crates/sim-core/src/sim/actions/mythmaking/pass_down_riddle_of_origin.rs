use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("pass down riddle of origin");
    ctx.event("life", "pass down riddle of origin");
    0.005
}
