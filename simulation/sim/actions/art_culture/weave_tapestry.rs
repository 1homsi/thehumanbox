//! Action 324: weave a tapestry from gathered fibers.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().boredom = (ctx.org().boredom - 0.06).max(0.0);
    ctx.think("weaving a tapestry");
    ctx.discover("weaving", "wove the first tapestry");
    ctx.event("build", "created a woven tapestry");
    0.010
}
