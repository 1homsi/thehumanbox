//! Action 318: paint a mural on a nearby rock face.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near { return 0.0; }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.08).max(0.0);
    ctx.think("painting a mural");
    ctx.discover("mural_art", "painted the first mural");
    ctx.event("build", "decorated the rock with painted images");
    0.012
}
