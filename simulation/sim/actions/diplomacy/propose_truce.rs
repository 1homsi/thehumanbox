
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied().find(|&k| {
        let o = &ctx.sim.organisms[k];
        o.lineage_id != lid
            && ctx.sim.organisms[ctx.idx].attitude_toward(&o.lineage_id) < 0.0
    });
    let Some(ki) = pick else {
        ctx.think("looking for a quarrel to settle");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.08);
    ctx.sim.organisms[ki].update_attitude(&lid, 0.06);
    ctx.think("proposing a truce");
    ctx.discover("truce", "proposed a truce");
    0.008
}
