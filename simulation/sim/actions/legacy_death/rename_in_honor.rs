
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("remembering the fallen by giving their name to something lasting");
    ctx.event("culture", "a place or tradition is renamed in honor of the departed");
    ctx.discover("naming_honor", "named something in memory of a fallen tribesman");
    0.007
}
