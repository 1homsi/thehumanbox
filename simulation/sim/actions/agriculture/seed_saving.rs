//! Action 355: save seeds from the harvest for next season.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 { return 0.0; }
    ctx.think("planning ahead by saving seeds");
    ctx.discover("seed_saving", "learned to save seeds for next season");
    ctx.event("build", "carefully selected and stored seeds for next planting");
    0.008
}
