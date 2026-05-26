use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger_near = ctx
        .near
        .iter()
        .any(|&i| ctx.sim.organisms[i].lineage_id != ctx.lid);
    if !stranger_near {
        return 0.0;
    }
    ctx.event("warfare", "blockading a key route to cut off the enemy");
    ctx.discover("blockade", "successfully blockaded an enemy route");
    0.012
}
