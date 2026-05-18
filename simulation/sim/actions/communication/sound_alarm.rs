//! Action 412: sound the alarm when a stranger is near.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let threat = ctx.near.iter().any(|&k| ctx.sim.organisms[k].lineage_id != lid);
    if !threat {
        ctx.think("all quiet");
        return 0.0;
    }
    ctx.think("raising the alarm");
    ctx.event("warfare", "sounded the alarm, alerting the group to an approaching threat");
    0.007
}
