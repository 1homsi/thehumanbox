
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near { return 0.0; }
    if ctx.kin.is_empty() { return 0.0; }
    ctx.think("burning away the ill fortune that has followed our line");
    ctx.discover("curse_breaking", "performed a ritual to break an ancient family curse");
    ctx.event("ritual", "the tribe gathers at the fire to break a family curse");
    ctx.org_mut().comfort = (ctx.org().comfort + 0.06).min(1.0);
    0.012
}
