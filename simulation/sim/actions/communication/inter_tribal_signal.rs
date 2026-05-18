
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no other tribe to signal");
        return 0.0;
    };
    let their_lid = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their_lid, 0.05);
    ctx.think("exchanging peace signals");
    ctx.discover("diplomacy_signal", "established a shared inter-tribal signalling system");
    ctx.event("social", "sent a diplomatic signal to a neighbouring tribe");
    0.012
}
