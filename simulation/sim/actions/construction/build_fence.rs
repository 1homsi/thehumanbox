use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        structure_add: 0.02,
        mark_active:   true,
        thought:       "setting a fence",
        discovery:     "fencing",
        event_msg:     "fenced the homestead",
        reward:        0.004,
        ..Default::default()
    })
}
