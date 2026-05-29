use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    if ctx.kin.len() < 3 {
        return 0.0;
    }
    ctx.think("witnessing the crowning of a new leader");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.08).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.08).min(1.0);
    ctx.discover("coronation", "performed the first coronation ceremony");
    ctx.event("ritual", "the tribe gathers to crown a new leader");
    0.015
}
