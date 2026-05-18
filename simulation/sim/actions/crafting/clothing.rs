//! Action 56: stitch hides into clothing.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("clothing", 0.012);
    ctx.think("stitching hides");
    r
}
