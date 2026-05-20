use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_either_material: true,
        structure_add:        0.07,
        mark_active:          true,
        thought:              "building a watchtower",
        discovery:            "watchtower",
        event_msg:            "raised a watchtower",
        reward:               0.014,
        ..Default::default()
    })
}
