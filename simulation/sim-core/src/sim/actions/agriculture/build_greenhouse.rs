use super::super::construction::{start_project, ProjectSpec};
use super::super::ctx::ActionCtx;
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        return 0.0;
    }
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Greenhouse,
            thought: "building a greenhouse",
            reward: 0.015,
        },
    )
}
