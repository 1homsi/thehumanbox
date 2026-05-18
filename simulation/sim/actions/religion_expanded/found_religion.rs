//! Action 456: found an organised religion with elder leadership.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder || ctx.kin.len() < 2 { return 0.0; }
    let lid = ctx.lid.clone();
    ctx.event("culture", &format!("lineage {} elder founded an organised religion", lid));
    ctx.discover("organized_religion", "founded an organised religion");
    0.020
}
