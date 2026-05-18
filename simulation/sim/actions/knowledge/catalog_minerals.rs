
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("seeking ore samples");
        return 0.0;
    }
    ctx.think("studying the stone");
    ctx.discover("geology", "began studying minerals");
    0.004
}
