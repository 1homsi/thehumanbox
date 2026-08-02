use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.06).max(0.0);
    ctx.sim.grid.add_structure(ctx.ix, ctx.iy, 0.16);
    ctx.sim.active_structure_tiles.insert((ctx.ix, ctx.iy));
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Food, 0.60);
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.05);
    ctx.think("planting a dense farm hedgerow");
    ctx.discover("hedgerow", "planted a living farm boundary and wildlife corridor");
    ctx.event(
        "build",
        "planted a hedgerow that shelters crops and slows wildfire",
    );
    0.021
}
