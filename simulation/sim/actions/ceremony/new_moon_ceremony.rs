
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.is_night() { return 0.0; }
    ctx.think("gathering under the dark sky to honor the new moon");
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    ctx.discover("lunar_ceremony", "held the first new moon ceremony");
    ctx.event("ritual", "a new moon ceremony is held under the dark sky");
    0.008
}
