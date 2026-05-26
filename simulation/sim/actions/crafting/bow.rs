use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("bow", 0.016);
    ctx.think("carving a bow");
    r
}
