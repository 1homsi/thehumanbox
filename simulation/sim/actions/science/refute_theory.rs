//! Action 430: refute an existing theory through evidence.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.07).max(0.0);
    ctx.event("culture", "challenging an accepted theory with new evidence");
    ctx.discover("critical_thinking", "learned to question and refute theories");
    0.012
}
