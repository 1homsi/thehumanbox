//! Action 520: teach language to a stranger; discover "language_teaching"; emit "culture"; attitude +0.08.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger = ctx.near.iter().copied()
        .find(|&n| ctx.sim.organisms[n].lineage_id != ctx.lid);
    let Some(si) = stranger else { return 0.0; };
    let slid = ctx.sim.organisms[si].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&slid, 0.08);
    ctx.think("bridging the gap between us through shared words");
    ctx.discover("language_teaching", "taught our language to someone from another group");
    ctx.event("culture", "language lessons bridge two groups together");
    0.012
}
