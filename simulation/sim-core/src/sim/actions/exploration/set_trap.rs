use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    if ctx.org().inv_wood == 0
        || ctx.sim.grid.trail_at(ix, iy, TrailKind::Food) >= 0.45
        || ctx.sim.grid.structure_at(ix, iy) >= 0.015
    {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Food, 2.6);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 0.35);
    ctx.sim.grid.add_structure(ix, iy, 0.04);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("setting a trap");
    ctx.discover("trap", "set a hunting trap");
    0.008
}
