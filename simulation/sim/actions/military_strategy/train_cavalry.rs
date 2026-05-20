
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().energy = (ctx.org().energy + 0.04).min(1.0);
    ctx.event("warfare", "training cavalry for rapid strike capability");
    ctx.discover("cavalry_tactics", "mastered cavalry tactics");
    0.040
}
