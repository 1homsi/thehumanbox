use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Sand | Tile::Grass) && ctx.chance(0.30) {
        start_project(
            ctx,
            ProjectSpec {
                kind: BuildingKind::Well,
                thought: "striking groundwater",
                reward: 0.04,
            },
        )
    } else {
        ctx.think("digging deeper");
        0.0
    }
}
