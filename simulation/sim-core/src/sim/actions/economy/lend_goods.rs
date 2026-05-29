use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_wood == 0 {
        ctx.think("no wood to lend");
        return 0.0;
    }
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no one to lend to");
        return 0.0;
    };
    ctx.sim.organisms[ctx.idx].inv_wood -= 1;
    ctx.sim.organisms[ki].inv_wood = ctx.sim.organisms[ki].inv_wood.saturating_add(1);
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.1);
    ctx.think("lending wood in good faith");
    ctx.event("trade", "lent wood to a stranger");
    0.007
}
