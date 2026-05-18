//! Action 437: train nearby kin as soldiers.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].health = (ctx.sim.organisms[ki].health + 0.03).min(1.0);
    }
    ctx.event("warfare", "drilling kin in combat technique");
    ctx.discover("military_training", "established the first military training regimen");
    0.012
}
