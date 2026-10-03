use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Theatre,
            thought: "carving an amphitheater",
            reward: 0.014,
        },
    )
}
