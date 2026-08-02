use super::super::ctx::ActionCtx;
use super::{nearby_hazard, remember_hazard};
use crate::world::{grid::TrailKind, tiles::Tile};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((hazard_x, hazard_y)) = nearby_hazard(ctx.sim, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    let hazard = if ctx.sim.grid.get(hazard_x, hazard_y) == Tile::Fire {
        "fire"
    } else {
        "flood"
    };
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.035).max(0.0);
    ctx.sim.grid.add_structure(ctx.ix, ctx.iy, 0.12);
    ctx.sim.active_structure_tiles.insert((ctx.ix, ctx.iy));
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Path, 1.2);
    remember_hazard(ctx, hazard_x, hazard_y, 0.90);
    ctx.think("placing warning markers");
    ctx.discover("hazard_marking", "began marking dangerous areas to warn others");
    ctx.event(
        "build",
        &format!("marked a {hazard} hazard at ({hazard_x},{hazard_y}) and warned the group"),
    );
    0.015
}
