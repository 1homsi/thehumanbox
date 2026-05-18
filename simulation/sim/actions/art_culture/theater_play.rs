//! Action 322: perform a theater play with 3+ kin; comfort +0.07 all.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 3 { return 0.0; }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.07).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.07).min(1.0);
    ctx.think("performing a play");
    ctx.discover("theater", "staged the first theatrical performance");
    ctx.event("culture", "performed a play for the community");
    0.015
}
