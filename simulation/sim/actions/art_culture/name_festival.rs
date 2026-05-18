//! Action 332: name a festival with 3+ kin; comfort +0.08 all.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 3 { return 0.0; }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.08).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.08).min(1.0);
    ctx.think("naming a festival");
    ctx.discover("festival", "declared the first communal festival");
    ctx.event("culture", "a festival was named and celebrated");
    0.015
}
