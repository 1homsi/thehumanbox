use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_water_near: true,
        need_stone: true,
        structure_add: 0.05,
        mark_active: true,
        thought: "laying a quay",
        discovery: "quay",
        event_msg: "built a stone quay",
        reward: 0.012,
        ..Default::default()
    })
}
