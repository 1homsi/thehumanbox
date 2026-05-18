//! Action 143: ferment a drink. Consumes 1 food, raises comfort.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 { return 0.0; }
    let o = ctx.org_mut();
    o.inv_food -= 1;
    o.comfort = (o.comfort + 0.05).min(1.0);
    ctx.think("fermenting a drink");
    ctx.discover("fermentation", "fermented the first drink");
    0.006
}
