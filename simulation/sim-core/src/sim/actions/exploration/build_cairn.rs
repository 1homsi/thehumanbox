use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 || ctx.sim.grid.structure_at(ctx.ix, ctx.iy) >= 0.10 {
        ctx.think("no stone for a cairn");
        return 0.0;
    }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.22);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 4.0);
    for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        ctx.sim.grid.leave_trail(ix + dx, iy + dy, TrailKind::Path, 1.8);
    }
    ctx.org_mut()
        .danger_memory
        .retain(|&(x, y), _| (x - ix).abs() + (y - iy).abs() > 2);
    ctx.think("stacking a cairn");
    ctx.discover("cairn", "built a navigation cairn");
    0.010
}
