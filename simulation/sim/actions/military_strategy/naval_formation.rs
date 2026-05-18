//! Action 452: organise units into a naval battle formation.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near { return 0.0; }
    ctx.event("warfare", "arranging forces into naval battle formation");
    ctx.discover("naval_tactics", "developed naval warfare tactics");
    0.015
}
