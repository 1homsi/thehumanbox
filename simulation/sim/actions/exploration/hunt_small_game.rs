//! Action 121: hunt small game. 20% success.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.chance(0.20) {
        ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
        ctx.think("caught small game");
        ctx.discover("trapping-game", "learned to hunt small game");
        0.012
    } else {
        ctx.think("tracking small game");
        0.0
    }
}
