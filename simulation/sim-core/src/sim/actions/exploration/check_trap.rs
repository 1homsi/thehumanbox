use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    // A trap catches what wanders past it.
    if ctx.chance(0.35) && ctx.catch_small_prey(3.0) > 0 {
        ctx.think("a trap caught something");
        0.012
    } else {
        ctx.think("checking the traps");
        0.0
    }
}
