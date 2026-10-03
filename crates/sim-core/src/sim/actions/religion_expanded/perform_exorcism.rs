use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let target = ctx
        .kin
        .iter()
        .find(|&&ki| ctx.sim.organisms[ki].infection > 0.3)
        .copied();
    let Some(ti) = target else {
        return 0.0;
    };
    ctx.sim.organisms[ti].infection = (ctx.sim.organisms[ti].infection - 0.1).max(0.0);
    ctx.event("ritual", "performing a ritual exorcism to drive out sickness");
    0.012
}
