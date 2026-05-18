//! Action 365: guard the flock from threats.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("guarding the flock");
    ctx.discover("herding", "took up the role of shepherd");
    ctx.event("defense", "stood guard over the flock through the night");
    0.005
}
