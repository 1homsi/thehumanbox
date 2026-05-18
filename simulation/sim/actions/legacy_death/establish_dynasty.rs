
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    if ctx.kin.is_empty() { return 0.0; }
    ctx.think("founding a line that will endure beyond my years");
    ctx.discover("dynasty", "established a dynastic lineage to carry on their legacy");
    ctx.event("governance", "an elder founds a dynasty to secure the tribe's future");
    0.015
}
