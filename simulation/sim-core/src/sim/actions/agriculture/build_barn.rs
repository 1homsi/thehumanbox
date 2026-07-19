use super::super::construction::{start_project, ProjectSpec};
use super::super::ctx::ActionCtx;
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    // Granary is the canonical agricultural storage building represented in
    // the world model; the barn action opens that real project instead of
    // granting an immediate narrative-only structure.
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Granary,
            thought: "building a barn",
            reward: 0.012,
        },
    )
}
