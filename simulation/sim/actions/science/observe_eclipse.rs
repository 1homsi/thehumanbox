//! Action 434: observe an eclipse and record the event.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    ctx.event("culture", "witnessing an eclipse with awe and careful observation");
    ctx.discover("eclipse_observation", "observed and recorded an eclipse");
    0.010
}
