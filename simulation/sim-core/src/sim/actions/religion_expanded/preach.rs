use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        return 0.0;
    }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.04).min(1.0);
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.06).max(0.0);
    }
    ctx.event("ritual", "preaching to the faithful, lifting their spirit");
    0.010
}
