//! Action 525: war ceremony with kin and stranger nearby; emit "warfare"; discover "war_ritual".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    let stranger_present = ctx.near.iter().any(|&n| ctx.sim.organisms[n].lineage_id != ctx.lid);
    if !stranger_present { return 0.0; }
    ctx.think("rallying the tribe for battle with ritual and fervor");
    ctx.discover("war_ritual", "performed a war ceremony to prepare the tribe for conflict");
    ctx.event("warfare", "a war ceremony stirs the tribe to action against a rival");
    0.010
}
