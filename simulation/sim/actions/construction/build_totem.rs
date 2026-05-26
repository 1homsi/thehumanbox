use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        structure_add: 0.03,
        mark_active: true,
        thought: "raising a totem",
        discovery: "totem",
        event_msg: "carved a tribal totem",
        reward: 0.006,
        ..Default::default()
    })
}
