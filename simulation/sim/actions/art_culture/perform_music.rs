
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near { return 0.0; }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.06).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    ctx.think("performing music by the fire");
    ctx.event("culture", "played music around the fire");
    0.008
}
