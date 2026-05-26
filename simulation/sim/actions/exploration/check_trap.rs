use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    let trail_strong = ctx.sim.grid.trail_at(ix, iy, TrailKind::Food) > 0.3;
    if trail_strong && ctx.chance(0.35) {
        ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
        ctx.think("a trap caught something");
        0.012
    } else {
        ctx.think("checking the traps");
        0.0
    }
}
