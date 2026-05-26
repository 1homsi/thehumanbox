use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied().find(|&k| {
        let o = &ctx.sim.organisms[k];
        o.lineage_id != lid && ctx.sim.organisms[ctx.idx].attitude_toward(&o.lineage_id) > 0.2
    });
    let Some(ki) = pick else {
        ctx.think("seeking allies");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.10);
    ctx.think("forging an alliance");
    ctx.discover("alliance", "forged an alliance");
    0.01
}
