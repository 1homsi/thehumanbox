use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().discoveries.contains("chronicle") {
        return 0.0;
    }
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Library,
            thought: "raising a library",
            reward: 0.016,
        },
    )
}
