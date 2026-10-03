use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Water | Tile::Flooded | Tile::Void) {
        return 0.0;
    }
    let elev = ctx.sim.grid.elevation[WorldGrid::idx(ctx.ix, ctx.iy)];
    if !ctx.rock_near && elev <= 0.7 {
        return 0.0;
    }
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Watchtower,
            thought: "raising a lookout",
            reward: 0.010,
        },
    )
}
