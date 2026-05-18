//! Action 370: build a stone corral for containing livestock.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    ctx.think("building a stone corral");
    ctx.discover("corral", "built the first stone corral");
    ctx.event("build", "enclosed a stone corral for livestock");
    0.012
}
