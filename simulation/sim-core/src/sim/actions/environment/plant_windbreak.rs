use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.06).max(0.0);
    ctx.sim.grid.add_structure(ctx.ix, ctx.iy, 0.18);
    ctx.sim.active_structure_tiles.insert((ctx.ix, ctx.iy));
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Food, 0.35);
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.04);
    ctx.think("planting a dense windbreak");
    ctx.discover("windbreak", "planted a windbreak to shelter the land");
    ctx.event(
        "build",
        "planted a living windbreak that slows wildfire and shelters new growth",
    );
    0.018
}
