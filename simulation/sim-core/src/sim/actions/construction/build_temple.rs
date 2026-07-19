use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::tech::buildings::BuildingKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_faith = ctx.org().discoveries.contains("faith") || ctx.org().discoveries.contains("ritual");
    if !has_faith {
        return 0.0;
    }
    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Temple,
            thought: "raising a temple",
            reward: 0.020,
        },
    )
}
