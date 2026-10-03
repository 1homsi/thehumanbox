use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;
use crate::world::tiles::Tile;

/// Nobody digs a new well within this many tiles of a standing one.
pub(crate) const WELL_SPACING: i32 = 10;

/// True when a standing well, finished or still being dug, is close enough
/// to draw from.
pub(crate) fn well_within_reach(sim: &crate::sim::simulation::Simulation, x: i32, y: i32) -> bool {
    sim.buildings.iter().any(|b| {
        b.kind == BuildingKind::Well && !b.is_ruined() && (b.x - x).abs() + (b.y - y).abs() <= WELL_SPACING
    })
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if well_within_reach(ctx.sim, ctx.ix, ctx.iy) {
        ctx.think("the well is close enough");
        return 0.0;
    }
    if matches!(ctx.tile, Tile::Sand | Tile::Grass) && ctx.chance(0.4) {
        start_project(
            ctx,
            ProjectSpec {
                kind: BuildingKind::Well,
                thought: "digging a well",
                reward: 0.05,
            },
        )
    } else {
        0.0
    }
}
