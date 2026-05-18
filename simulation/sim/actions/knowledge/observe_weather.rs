//! Action 69: read the weather.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("reading the weather");
    ctx.discover("meteorology", "learned to read the sky");
    0.003
}
