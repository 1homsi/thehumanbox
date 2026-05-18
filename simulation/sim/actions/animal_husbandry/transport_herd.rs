//! Action 367: move the herd to new pasture.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("moving the herd to new pasture");
    ctx.discover("herding", "learned to move herds across the land");
    ctx.event("build", "transported the herd to fresh grazing grounds");
    0.006
}
