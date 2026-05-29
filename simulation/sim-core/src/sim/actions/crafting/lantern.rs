use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let r = ctx.craft("lantern", 0.010);
    ctx.think("crafting a lantern");
    r
}
