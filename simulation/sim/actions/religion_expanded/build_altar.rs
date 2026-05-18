//! Action 460: build a stone altar for worship.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    ctx.event("build", "raising a stone altar as a sacred site");
    ctx.discover("altar", "built the first altar");
    0.015
}
