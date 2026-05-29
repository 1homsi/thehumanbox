use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("hoping for a friend");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    let oid = ctx.sim.organisms[ki].id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.05);
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(oid).or_insert(0.0);
        *t = (*t + 0.08).min(1.0);
    }
    ctx.think("making a friend");
    0.006
}
