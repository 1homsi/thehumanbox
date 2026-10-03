use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 && ctx.org().inv_wood == 0 {
        return 0.0;
    }
    ctx.consume_material();
    ctx.think("carving an idol");
    ctx.discover("sculpture", "carved an idol");
    0.008
}
