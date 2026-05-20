use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_stone:    true,
        structure_add: 0.05,
        mark_active:   true,
        thought:       "firing up a kiln",
        discovery:     "kilns",
        event_msg:     "fired a kiln",
        reward:        0.012,
        ..Default::default()
    })
}
