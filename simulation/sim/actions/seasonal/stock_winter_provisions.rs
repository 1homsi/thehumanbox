
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 { return 0.0; }
    ctx.think("preparing for the cold season ahead");
    ctx.event("build", "stocking provisions to survive the winter");
    0.007
}
