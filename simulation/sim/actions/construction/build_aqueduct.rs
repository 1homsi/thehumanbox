//! Action 167: build an aqueduct. Needs water adjacency + material.

use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near
        || (ctx.org().inv_stone == 0 && ctx.org().inv_wood == 0)
    {
        return 0.0;
    }
    ctx.consume_material();
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 1.5);
    ctx.sim.grid.add_structure(ix, iy, 0.04);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("laying an aqueduct");
    ctx.discover("aqueducts", "engineered an aqueduct");
    0.012
}
