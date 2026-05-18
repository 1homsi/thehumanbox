
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().boredom > 0.3 {
        ctx.think("still searching for meaning");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.08).min(1.0);
    ctx.think("feeling a clear sense of purpose");
    ctx.discover("purpose", "found deep purpose in their actions");
    ctx.event("emotion", "discovered a sense of purpose that drives them forward");
    0.015
}
