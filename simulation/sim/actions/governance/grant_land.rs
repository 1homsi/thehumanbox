//! Action 303: mark territory with a discover "land_grant".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no kin to grant land to");
        return 0.0;
    }
    ctx.think("granting land to kin");
    ctx.discover("land_grant", "formally granted territory to a tribe member");
    ctx.event("governance", "awarded land rights within tribal territory");
    0.01
}
