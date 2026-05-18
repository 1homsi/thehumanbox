
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        ctx.think("not yet old enough to look back");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.06).min(1.0);
    ctx.think("at peace with a long life");
    ctx.discover("wisdom", "made peace with the past and found true wisdom");
    ctx.event("emotion", "an elder made peace with the past, passing wisdom to the group");
    0.015
}
