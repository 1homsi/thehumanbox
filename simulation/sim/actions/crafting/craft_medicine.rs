
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.fire_near || ctx.org().discoveries.contains("fire") {
        let r = ctx.craft("medicine", 0.016);
        ctx.think("brewing medicine");
        r
    } else {
        ctx.think("seeking herbs");
        0.0
    }
}
