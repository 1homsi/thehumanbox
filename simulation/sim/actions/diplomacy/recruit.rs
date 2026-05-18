//! Action 95: welcome an outsider.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("calling for newcomers");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.03);
    {
        let o = &mut ctx.sim.organisms[ki];
        o.loneliness = (o.loneliness - 0.06).max(0.0);
    }
    ctx.think("welcoming an outsider");
    0.003
}
