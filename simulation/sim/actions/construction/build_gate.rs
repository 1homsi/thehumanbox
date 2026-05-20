use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_either_material: true,
        structure_add:        0.04,
        mark_active:          true,
        thought:              "hanging a gate",
        discovery:            "gates",
        event_msg:            "built a gate",
        reward:               0.010,
        ..Default::default()
    })
}
