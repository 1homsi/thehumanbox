
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.10).max(0.0);
    ctx.think("writing a poem");
    ctx.discover("poetry", "composed the first poem");
    ctx.event("culture", "penned verses for the ages");
    0.008
}
