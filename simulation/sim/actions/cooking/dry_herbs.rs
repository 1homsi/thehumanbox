
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.is_night() { return 0.0; }
    ctx.think("drying herbs in the sun");
    ctx.discover("herbalism", "learned to dry herbs");
    0.003
}
