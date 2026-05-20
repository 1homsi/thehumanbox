use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        structure_add: 0.04,
        mark_active:   true,
        thought:       "building a shrine",
        discovery:     "religion",
        event_msg:     "built a shrine",
        reward:        0.008,
        ..Default::default()
    })
}
