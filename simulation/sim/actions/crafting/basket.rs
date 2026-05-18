
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("basket", 0.010);
    ctx.think("weaving a basket");
    r
}
