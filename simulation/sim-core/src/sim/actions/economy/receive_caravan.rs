use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid && ctx.sim.organisms[k].inv_food > 0);
    let Some(ki) = pick else {
        ctx.think("no caravan arriving");
        return 0.0;
    };
    ctx.sim.organisms[ki].inv_food -= 1;
    ctx.sim.organisms[ctx.idx].inv_food = ctx.sim.organisms[ctx.idx].inv_food.saturating_add(1);
    ctx.think("receiving caravan goods");
    ctx.event("trade", "received a caravan delivering food");
    0.008
}
