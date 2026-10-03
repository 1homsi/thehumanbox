use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_blade = ctx.org().discoveries.contains("knife")
        || ctx.org().discoveries.contains("axe")
        || ctx.org().discoveries.contains("spear");
    if !has_blade {
        ctx.think("nothing to sharpen");
        return 0.0;
    }
    ctx.think("sharpening a blade");
    ctx.discover("whetstones", "learned to whet stone");
    0.004
}
