
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger_near = ctx.near.iter().any(|&i| ctx.sim.organisms[i].lineage_id != ctx.lid);
    if !stranger_near { return 0.0; }
    ctx.event("warfare", "quietly observing enemy movements to gather intelligence");
    ctx.discover("military_intelligence", "established systematic intelligence gathering");
    0.012
}
