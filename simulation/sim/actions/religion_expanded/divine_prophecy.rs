//! Action 462: an elder pronounces a divine prophecy.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    let lid = ctx.lid.clone();
    ctx.event("culture", &format!("elder of lineage {} proclaimed a divine prophecy", lid));
    ctx.discover("prophecy", "delivered a prophecy that shaped the community");
    0.018
}
