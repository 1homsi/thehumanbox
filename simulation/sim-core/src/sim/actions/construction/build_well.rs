use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
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
