//! Action 234: restore attitude toward a lineage you have low attitude with.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    // Find a lineage we have a low attitude toward among nearby organisms
    let target_lid = ctx.near.iter().copied()
        .map(|k| ctx.sim.organisms[k].lineage_id.clone())
        .find(|l| *l != lid);
    let Some(tl) = target_lid else {
        ctx.think("no one to reconcile with");
        return 0.0;
    };
    ctx.sim.organisms[ctx.idx].update_attitude(&tl, 0.10);
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.04).min(1.0);
    ctx.think("seeking reconciliation");
    ctx.event("social", "reconciled with a rival lineage");
    0.008
}
