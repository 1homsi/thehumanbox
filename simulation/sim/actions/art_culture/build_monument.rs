//! Action 328: erect a stone monument.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    ctx.think("raising a monument");
    ctx.discover("monument", "built the first monument");
    ctx.event("build", "erected a stone monument");
    0.015
}
