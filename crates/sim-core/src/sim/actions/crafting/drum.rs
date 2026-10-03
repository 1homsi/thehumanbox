use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("drum", 0.008);
    ctx.think("building a drum");
    r
}
