//! Action 333: elder composes an anthem for the lineage.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    let lid = ctx.lid.clone();
    ctx.org_mut().boredom = (ctx.org().boredom - 0.10).max(0.0);
    ctx.think("composing the lineage anthem");
    ctx.discover("lineage_anthem", "composed an anthem for the lineage");
    ctx.event("culture", &format!("lineage {} now has an anthem", lid));
    0.015
}
