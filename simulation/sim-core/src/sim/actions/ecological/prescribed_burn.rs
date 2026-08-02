use super::super::ctx::ActionCtx;
use crate::world::tiles::{Biome, Tile};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_water -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.10).max(0.0);
    let mut candidates = vec![(ctx.ix, ctx.iy)];
    let mut neighbors: Vec<_> = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        .into_iter()
        .map(|(dx, dy)| (ctx.ix + dx, ctx.iy + dy))
        .filter(|&(x, y)| {
            ctx.sim.grid.biome_at(x, y) == Biome::Forest
                && matches!(ctx.sim.grid.get(x, y), Tile::Grass | Tile::Food)
        })
        .collect();
    neighbors.sort_by(|&(ax, ay), &(bx, by)| {
        let a = ctx.sim.grid.pressure[crate::world::grid::WorldGrid::idx(ax, ay)];
        let b = ctx.sim.grid.pressure[crate::world::grid::WorldGrid::idx(bx, by)];
        b.total_cmp(&a).then_with(|| (ax, ay).cmp(&(bx, by)))
    });
    candidates.extend(neighbors.into_iter().take(2));
    for &(x, y) in &candidates {
        ctx.sim.grid.set(x, y, Tile::Scorched);
        *ctx.sim.grid.fire_intensity_mut(x, y) = 0.0;
        ctx.sim.grid.relieve_pressure(x, y, 1.8);
        ctx.sim.grid.restore_fertility(x, y, 0.10);
    }
    ctx.think("holding a prescribed burn behind a water line");
    ctx.discover(
        "prescribed_burn",
        "used water and fire to reduce woodland fuel safely",
    );
    ctx.event(
        "build",
        &format!("completed a contained {}-tile prescribed burn", candidates.len()),
    );
    0.024 + candidates.len() as f32 * 0.004
}
