
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let stranger_child = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid && ctx.sim.organisms[k].age < 400);
    let Some(ki) = stranger_child else {
        ctx.think("no child to adopt");
        return 0.0;
    };
    let their_lid = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their_lid, 0.10);
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.10).min(1.0);
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.06).min(1.0);
    ctx.think("arranging an adoption");
    ctx.event("bond", "welcomed a stranger's child into the family");
    0.012
}
