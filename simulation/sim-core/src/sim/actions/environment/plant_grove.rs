use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.05).max(0.0);
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Food, 1.25);
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.12);
    for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        ctx.sim
            .grid
            .leave_trail(ctx.ix + dx, ctx.iy + dy, TrailKind::Food, 0.35);
        ctx.sim.grid.restore_fertility(ctx.ix + dx, ctx.iy + dy, 0.025);
    }
    ctx.think("planting young trees in rows");
    ctx.discover(
        "grove_planting",
        "established a managed grove for future harvests",
    );
    ctx.event(
        "build",
        "planted a grove whose food trail will support future regrowth",
    );
    0.017
}
