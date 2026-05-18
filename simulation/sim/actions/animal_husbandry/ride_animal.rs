//! Action 362: ride a trained animal for travel.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().energy = (ctx.org().energy + 0.05).min(1.0);
    ctx.think("riding an animal");
    ctx.discover("riding", "rode an animal for the first time");
    ctx.event("build", "rode a tamed animal across the land");
    0.010
}
