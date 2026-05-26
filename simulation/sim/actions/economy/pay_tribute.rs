use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_stone == 0 {
        ctx.think("no stone to offer as tribute");
        return 0.0;
    }
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no one to pay tribute to");
        return 0.0;
    };
    ctx.sim.organisms[ctx.idx].inv_stone -= 1;
    ctx.sim.organisms[ki].inv_stone = ctx.sim.organisms[ki].inv_stone.saturating_add(1);
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.08);
    ctx.think("paying tribute");
    ctx.event("trade", "paid stone tribute to a foreign lineage");
    0.007
}
