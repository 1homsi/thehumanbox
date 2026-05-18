//! Action 235: emit a social event defending actor's name.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.04).min(1.0);
    ctx.think("defending my reputation");
    ctx.event("social", "stood up to defend their own reputation");
    0.005
}
