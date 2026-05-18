//! Action 443: build a war camp from available timber.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.event("build", "constructing a fortified war camp");
    ctx.discover("war_camp", "established the first war camp");
    0.012
}
