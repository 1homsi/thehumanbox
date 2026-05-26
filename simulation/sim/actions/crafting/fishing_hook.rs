use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("fishing-hook", 0.010);
    ctx.think("knapping a fishhook");
    r
}
