//! Action 331: devise a calendar to track seasons and cycles.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("devising a calendar");
    ctx.discover("calendar", "invented the first calendar");
    ctx.event("build", "carved a seasonal calendar into stone");
    0.015
}
