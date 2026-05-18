//! Action 312: ceremonially appoint an elder kin; all kin comfort +0.05; discover "leadership".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_elder_kin = ctx.kin.iter().copied()
        .any(|k| ctx.sim.organisms[k].is_elder);
    if !has_elder_kin {
        ctx.think("no elder kin worthy of anointment");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
    }
    ctx.think("anointing a leader");
    ctx.discover("leadership", "performed the anointment ceremony for a new leader");
    ctx.event("governance", "ceremonially anointed an elder as tribal leader");
    0.015
}
