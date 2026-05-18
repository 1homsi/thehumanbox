//! Action 431: conduct an experiment using fire or water.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near && !ctx.water_near { return 0.0; }
    ctx.event("build", "conducting a controlled experiment");
    if ctx.chance(0.25) {
        ctx.discover("chemistry", "stumbled upon a chemical reaction");
        return 0.018;
    }
    0.007
}
