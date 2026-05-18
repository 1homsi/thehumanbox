//! Action 165: shape a mortar.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("mortar", 0.008);
    ctx.think("shaping a mortar");
    r
}
