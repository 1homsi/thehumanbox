use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near {
        return 0.0;
    }
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Forge,
            thought: "building a forge",
            reward: 0.014,
        },
    )
}
