
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("carved-bone", 0.008);
    ctx.think("carving bone");
    r
}
