//! Action 390: overcome fear after a threat. Boosts health and unlocks courage.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().health = (ctx.org().health + 0.02).min(1.0);
    ctx.think("facing the fear head-on");
    ctx.discover("courage", "overcame fear and found inner strength");
    ctx.event("emotion", "faced their fear and emerged stronger");
    0.010
}
