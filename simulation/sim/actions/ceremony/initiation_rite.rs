//! Action 528: initiation rite for young kin with an elder; discover "initiation"; emit "ritual".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    let young = ctx.kin.iter().copied().find(|&k| ctx.sim.organisms[k].age < 400);
    if young.is_none() { return 0.0; }
    ctx.think("guiding a young one through the trials of initiation");
    ctx.discover("initiation", "performed the first formal initiation rite");
    ctx.event("ritual", "an elder leads a young tribesman through an initiation rite");
    0.010
}
