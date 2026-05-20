use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_wood:     true,
        structure_add: 0.02,
        mark_active:   true,
        thought:       "hammering a drying rack",
        discovery:     "drying-rack",
        event_msg:     "built a drying rack",
        reward:        0.006,
        ..Default::default()
    })
}
