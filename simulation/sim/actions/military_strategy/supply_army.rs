//! Action 441: supply the army with food from inventory.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 { return 0.0; }
    ctx.org_mut().inv_food -= 1;
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].energy = (ctx.sim.organisms[ki].energy + 0.04).min(1.0);
    }
    ctx.event("warfare", "supplying the army to keep them battle-ready");
    0.010
}
