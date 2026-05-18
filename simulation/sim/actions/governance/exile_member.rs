//! Action 299: push a low-attitude kin away.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.kin.iter().copied().find(|&k| {
        let kin_lid = ctx.sim.organisms[k].lineage_id.clone();
        ctx.sim.organisms[ctx.idx].attitude_toward(&kin_lid) < -0.1
            || ctx.sim.organisms[k].comfort < 0.2
    });
    let Some(ki) = pick else {
        ctx.think("no member deserves exile");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, -0.1);
    ctx.sim.organisms[ctx.idx].update_attitude(&lid, 0.02);
    ctx.think("exiling a troublemaker");
    ctx.event("governance", "exiled a disruptive member from the tribe");
    0.008
}
