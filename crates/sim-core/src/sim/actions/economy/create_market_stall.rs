use super::super::ctx::ActionCtx;
use crate::sim::actions::construction::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::MarketStall,
            thought: "setting up a market stall",
            reward: 0.015,
        },
    )
}
