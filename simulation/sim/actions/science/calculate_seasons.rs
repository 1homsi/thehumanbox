
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.event("build", "calculating the pattern of seasons from long observation");
    ctx.discover("seasonal_calculation", "calculated the seasonal cycle");
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.04).max(0.0);
    }
    0.015
}
