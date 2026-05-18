//! Action 334: street performance for strangers; comfort +0.03 all near.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_stranger = ctx.near.iter().any(|&ni| ctx.sim.organisms[ni].lineage_id != ctx.lid);
    if !has_stranger { return 0.0; }
    for i in 0..ctx.near.len() {
        let ni = ctx.near[i];
        ctx.sim.organisms[ni].comfort = (ctx.sim.organisms[ni].comfort + 0.03).min(1.0);
    }
    ctx.think("performing in the street");
    ctx.event("culture", "performed for strangers passing by");
    0.007
}
