
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.08).max(0.0);
    ctx.event("build", "developing a system of mathematics");
    ctx.discover("mathematics", "developed mathematical thinking");
    0.015
}
