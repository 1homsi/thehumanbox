use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid && ctx.sim.organisms[k].inv_food > 0);
    let Some(ki) = pick else {
        ctx.think("looking for a trade partner");
        return 0.0;
    };
    if ctx.sim.organisms[ctx.idx].inv_food == 0 {
        ctx.think("nothing to barter with");
        return 0.0;
    }
    ctx.sim.organisms[ki].energy = (ctx.sim.organisms[ki].energy + 0.03).min(1.0);
    ctx.sim.organisms[ctx.idx].energy = (ctx.sim.organisms[ctx.idx].energy + 0.03).min(1.0);
    ctx.think("bartering for food");
    ctx.event("trade", "exchanged food with a stranger in barter");
    0.008
}
