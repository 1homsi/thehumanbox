//! Action 517: spread learning to a stranger; attitude +0.06; emit "culture"; discover "educational_outreach".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger = ctx.near.iter().copied()
        .find(|&n| ctx.sim.organisms[n].lineage_id != ctx.lid);
    let Some(si) = stranger else { return 0.0; };
    let slid = ctx.sim.organisms[si].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&slid, 0.06);
    ctx.think("sharing what I know with those outside our group");
    ctx.discover("educational_outreach", "shared knowledge with a stranger to build goodwill");
    ctx.event("culture", "learning is spread to a neighboring group");
    0.010
}
