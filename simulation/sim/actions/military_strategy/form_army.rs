
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 3 { return 0.0; }
    ctx.event("warfare", "forming an army from willing kin");
    ctx.discover("army_formation", "organised kin into the first army");
    0.040
}
