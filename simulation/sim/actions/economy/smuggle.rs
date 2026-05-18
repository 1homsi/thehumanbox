//! Action 292: secretly move goods; chance(0.3) gain inv_food; emit "social" event if caught.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.chance(0.3) {
        ctx.sim.organisms[ctx.idx].inv_food += 1;
        ctx.think("smuggled goods successfully");
        0.007
    } else {
        ctx.think("caught smuggling");
        ctx.event("social", "was caught attempting to smuggle goods");
        ctx.sim.organisms[ctx.idx].comfort =
            (ctx.sim.organisms[ctx.idx].comfort - 0.05).max(0.0);
        0.001
    }
}
