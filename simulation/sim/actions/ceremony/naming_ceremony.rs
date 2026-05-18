//! Action 526: naming ceremony for a newborn kin (low age); emit "birth"; discover "naming_ceremony".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let newborn = ctx.kin.iter().copied().find(|&k| ctx.sim.organisms[k].age < 100);
    if newborn.is_none() { return 0.0; }
    ctx.think("giving this new life a name to carry through the world");
    ctx.discover("naming_ceremony", "held the first naming ceremony for a newborn");
    ctx.event("birth", "a naming ceremony welcomes a new member into the tribe");
    0.010
}
