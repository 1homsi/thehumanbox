
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("seeking a crossing");
        return 0.0;
    }
    ctx.org_mut().energy = (ctx.org().energy - 0.04).max(0.0);
    ctx.think("swimming across");
    ctx.discover("swimming", "learned to swim");
    0.004
}
