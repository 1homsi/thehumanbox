use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_water_near: true,
        structure_add:   0.04,
        mark_active:     true,
        thought:         "building a dock",
        discovery:       "dock",
        event_msg:       "built a dock",
        reward:          0.01,
        ..Default::default()
    })
}
