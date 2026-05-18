
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no confrontation to step away from");
        return 0.0;
    };
    let their_lid = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.org_mut().comfort = (ctx.org().comfort - 0.02).max(0.0);
    ctx.sim.organisms[ctx.idx].update_attitude(&their_lid, 0.03);
    ctx.think("choosing peace over pride");
    0.004
}
