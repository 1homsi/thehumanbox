use super::super::ctx::{ActionCtx, BuildSpec};
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_water_near: true,
        need_either_material: true,
        structure_add: 0.04,
        mark_active: true,
        trail: Some((TrailKind::Path, 1.5)),
        thought: "laying an aqueduct",
        discovery: "aqueducts",
        event_msg: "engineered an aqueduct",
        reward: 0.012,
        ..Default::default()
    })
}
