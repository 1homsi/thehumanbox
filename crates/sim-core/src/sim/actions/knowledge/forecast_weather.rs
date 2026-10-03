use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let qualified =
        ctx.org().discoveries.contains("meteorology") || ctx.org().discoveries.contains("cloud-lore");
    if !qualified {
        ctx.think("reading the sky");
        return 0.0;
    }
    ctx.think("forecasting the weather");
    ctx.discover("forecasting", "forecast tomorrow's weather");
    0.004
}
