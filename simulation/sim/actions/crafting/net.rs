//! Action 53: knot a net.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("net", 0.012);
    ctx.think("knotting a net");
    r
}
