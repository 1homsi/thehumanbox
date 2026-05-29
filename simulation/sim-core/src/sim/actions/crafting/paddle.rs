use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("paddle", 0.006);
    ctx.think("carving a paddle");
    r
}
