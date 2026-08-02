use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_blade = ctx.org().has_tool("knife") || ctx.org().has_tool("axe") || ctx.org().has_tool("spear");
    if !has_blade {
        ctx.think("nothing to sharpen");
        return 0.0;
    }
    ctx.think("sharpening a blade");
    ctx.discover("whetstones", "learned to whet stone");
    0.004
}
