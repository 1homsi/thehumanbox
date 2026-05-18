
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    let count = ctx.kin.len();
    ctx.event("warfare", &format!("drafting {} conscripts into service", count));
    ctx.discover("conscription", "implemented compulsory military service");
    0.010
}
