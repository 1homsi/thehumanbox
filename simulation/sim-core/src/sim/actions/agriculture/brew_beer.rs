use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 || !ctx.water_near {
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
    }
    ctx.think("brewing beer");
    ctx.discover("brewing", "brewed the first beer");
    ctx.event("culture", "shared freshly brewed beer with the group");
    0.012
}
