//! Action 428: improve an existing tool using available materials.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 && ctx.org().inv_stone == 0 { return 0.0; }
    ctx.event("build", "refining and improving a tool design");
    ctx.discover("tool_improvement", "improved a tool beyond its original form");
    0.010
}
