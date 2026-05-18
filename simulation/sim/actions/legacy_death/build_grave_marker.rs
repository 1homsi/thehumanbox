//! Action 489: build a grave marker using inv_stone; discover "grave_marking"; emit "build".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    ctx.think("placing a stone to mark where they rest");
    ctx.discover("grave_marking", "erected a stone grave marker for the first time");
    ctx.event("build", "a grave marker is set in place");
    0.008
}
