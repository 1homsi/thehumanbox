//! Action 391: accept loss when kin count is low.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() > 2 {
        ctx.think("still surrounded by family");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    ctx.think("accepting what cannot be changed");
    ctx.event("emotion", "found peace in accepting the loss of loved ones");
    0.007
}
