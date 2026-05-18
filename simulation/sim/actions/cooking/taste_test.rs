
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.04).max(0.0);
    if ctx.chance(0.08) {
        ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
        ctx.think("discovering a new flavour");
        ctx.discover("gastronomy", "discovered a new flavour");
        0.004
    } else {
        ctx.think("tasting carefully");
        0.0
    }
}
