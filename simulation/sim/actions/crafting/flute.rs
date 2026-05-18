//! Action 151: carve a flute.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("flute", 0.008);
    ctx.think("carving a flute");
    r
}
