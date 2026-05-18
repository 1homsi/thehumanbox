
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no one to forgive right now");
        return 0.0;
    };
    let their_lid = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their_lid, 0.1);
    ctx.think("letting go of old grudges");
    ctx.event("bond", "forgave a former enemy and opened the door to peace");
    0.010
}
