
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("watching the herd");
    ctx.discover("ethology", "began studying animal behaviour patterns");
    ctx.event("build", "recorded observations about animal behaviour");
    0.007
}
