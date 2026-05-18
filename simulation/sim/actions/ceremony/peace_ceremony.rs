//! Action 524: peace ceremony with a stranger; attitude +0.15; discover "peace_ceremony"; emit "ritual".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger = ctx.near.iter().copied()
        .find(|&n| ctx.sim.organisms[n].lineage_id != ctx.lid);
    let Some(si) = stranger else { return 0.0; };
    let slid = ctx.sim.organisms[si].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&slid, 0.15);
    ctx.think("laying down hostility and offering peace");
    ctx.discover("peace_ceremony", "performed the first formal peace ceremony");
    ctx.event("ritual", "a peace ceremony is held between two groups");
    0.015
}
