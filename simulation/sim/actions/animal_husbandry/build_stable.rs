
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("building a stable");
    ctx.discover("stable", "built the first animal stable");
    ctx.event("build", "constructed a stable for animals");
    0.012
}
