use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no stranger to envoy to");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.04);
    ctx.think("sending an envoy");
    ctx.discover("envoys", "sent an envoy abroad");
    0.006
}
