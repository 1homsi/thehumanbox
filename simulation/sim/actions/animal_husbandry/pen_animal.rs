//! Action 356: build a pen to contain animals.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("building an animal pen");
    ctx.discover("animal_pen", "built the first animal pen");
    ctx.event("build", "constructed a pen to keep animals");
    0.010
}
