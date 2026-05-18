
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.07).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.07).min(1.0);
    ctx.event("culture", "celebrating victory with a grand parade through the settlement");
    0.015
}
