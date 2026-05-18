//! Action 421: test a hypothesis through observation.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("testing my hypothesis");
    ctx.event("build", "testing a hypothesis through careful observation");
    if ctx.chance(0.3) {
        ctx.discover("empirical_method", "discovered the empirical method through testing");
        return 0.015;
    }
    0.006
}
