use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        structure_add: 0.05,
        mark_active:   true,
        thought:       "fortifying the camp",
        discovery:     "fortification",
        event_msg:     "fortified the camp",
        reward:        0.008,
        ..Default::default()
    })
}
