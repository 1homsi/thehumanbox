//! Action 411: call for help when low on health; comfort boost from solidarity.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().health > 0.4 {
        ctx.think("managing fine on their own");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.03).min(1.0);
    ctx.think("crying out for aid");
    ctx.event("social", "called for help, alerting all nearby kin to their need");
    0.006
}
