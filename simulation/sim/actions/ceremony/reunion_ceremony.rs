//! Action 527: reunion ceremony with many kin; all comfort +0.07; emit "culture".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 3 { return 0.0; }
    ctx.think("celebrating the gathering of those long apart");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.07).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.07).min(1.0);
    ctx.event("culture", "a joyful reunion ceremony brings the tribe together");
    0.010
}
