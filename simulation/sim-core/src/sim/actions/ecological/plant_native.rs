use super::super::ctx::ActionCtx;
use crate::world::{grid::TrailKind, tiles::Tile};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.04).max(0.0);
    if matches!(ctx.tile, Tile::Ash | Tile::Scorched) {
        ctx.sim.grid.set(ctx.ix, ctx.iy, Tile::Grass);
    }
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.12);
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Food, 1.0);
    for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        ctx.sim
            .grid
            .leave_trail(ctx.ix + dx, ctx.iy + dy, TrailKind::Food, 0.25);
    }
    ctx.think("sowing a patch of native plants");
    ctx.discover("native_restoration", "restored native plants with saved seed");
    ctx.event(
        "build",
        "seeded a native habitat patch that supports future forage",
    );
    0.020
}
