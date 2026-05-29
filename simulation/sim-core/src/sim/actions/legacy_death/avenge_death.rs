use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger = ctx
        .near
        .iter()
        .copied()
        .find(|&n| ctx.sim.organisms[n].lineage_id != ctx.lid);
    let Some(si) = stranger else {
        return 0.0;
    };
    let slid = ctx.sim.organisms[si].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&slid, -0.2);
    ctx.think("avenging the loss of one of our own");
    ctx.event("warfare", "driven by grief, seeks vengeance against a rival");
    0.007
}
