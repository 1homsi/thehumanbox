use crate::world::grid::TrailKind;
use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.build_one(BuildSpec {
        need_water_near: true,
        structure_add:   0.03,
        trail:           Some((TrailKind::Path, 2.0)),
        thought:         "building a bridge",
        discovery:       "bridge",
        event_msg:       "spanned a bridge",
        reward:          0.01,
        ..Default::default()
    })
}
