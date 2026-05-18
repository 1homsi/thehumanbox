
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.is_night() {
        ctx.think("waiting for the stars");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    ctx.think("charting constellations");
    ctx.discover("constellations", "charted the constellations");
    0.005
}
