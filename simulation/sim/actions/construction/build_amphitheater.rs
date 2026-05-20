use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_stone:    true,
        structure_add: 0.06,
        mark_active:   true,
        thought:       "carving an amphitheater",
        discovery:     "amphitheater",
        event_msg:     "carved an amphitheater",
        reward:        0.014,
        ..Default::default()
    })
}
