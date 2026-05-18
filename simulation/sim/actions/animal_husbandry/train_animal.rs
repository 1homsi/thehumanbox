//! Action 361: train an animal to assist with tasks.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.03).min(1.0);
    ctx.think("training an animal");
    ctx.discover("animal_training", "trained an animal to follow commands");
    ctx.event("build", "successfully trained a domestic animal");
    0.010
}
