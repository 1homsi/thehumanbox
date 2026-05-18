//! Action 323: carve a mask from wood.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("carving a mask");
    ctx.discover("mask_making", "crafted the first ceremonial mask");
    ctx.event("build", "carved a mask from wood");
    0.010
}
