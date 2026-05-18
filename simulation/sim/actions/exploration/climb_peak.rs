//! Action 118: climb the highest peak nearby.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let here = ctx.sim.grid.elevation.get(ctx.fidx).copied().unwrap_or(0.0);
    if here <= 0.6 {
        ctx.think("climbing higher");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    ctx.think("standing on the peak");
    ctx.discover("mountaineering", "climbed the highest peak");
    0.006
}
