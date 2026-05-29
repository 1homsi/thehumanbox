use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied().find(|&k| {
        let o = &ctx.sim.organisms[k];
        o.lineage_id == lid && ctx.sim.organisms[ctx.idx].attitude_toward(&o.lineage_id) < 0.0
    });
    let Some(ki) = pick else {
        ctx.think("no one in need of a pardon");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.15);
    ctx.think("granting a pardon");
    ctx.event(
        "governance",
        "pardoned an exiled member and restored their standing",
    );
    0.01
}
