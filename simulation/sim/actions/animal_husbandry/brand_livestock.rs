//! Action 366: brand livestock near fire and rock to mark ownership.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near || !ctx.fire_near { return 0.0; }
    ctx.think("branding livestock");
    ctx.discover("branding", "marked livestock with a brand for the first time");
    ctx.event("build", "branded the herd to mark ownership");
    0.008
}
