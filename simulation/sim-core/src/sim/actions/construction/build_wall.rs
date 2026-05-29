use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_either_material: true,
        structure_add: 0.06,
        mark_active: true,
        thought: "raising a wall",
        discovery: "walls",
        event_msg: "built the first wall",
        reward: 0.012,
        ..Default::default()
    })
}
