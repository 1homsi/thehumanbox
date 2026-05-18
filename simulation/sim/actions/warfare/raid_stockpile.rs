//! Action 198: raid a nearby food stockpile trail.
use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    let mut hit = false;
    'rs: for dx in -3..=3 {
        for dy in -3..=3 {
            if ctx.sim.grid.trail_at(ix + dx, iy + dy, TrailKind::Food) > 0.4 {
                ctx.sim.grid.leave_trail(ix + dx, iy + dy, TrailKind::Food, -0.5);
                ctx.sim.organisms[ctx.idx].inv_food =
                    ctx.sim.organisms[ctx.idx].inv_food.saturating_add(1);
                hit = true;
                break 'rs;
            }
        }
    }
    if hit {
        ctx.think("raiding a stockpile");
        ctx.discover("stockpile-raid", "raided a cache");
        0.010
    } else {
        ctx.think("scouting for caches");
        0.0
    }
}
