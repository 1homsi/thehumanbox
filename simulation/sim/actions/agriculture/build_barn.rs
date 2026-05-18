
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("building a barn");
    ctx.discover("barn", "constructed the first barn");
    ctx.event("build", "raised a barn for storage and shelter");
    0.012
}
