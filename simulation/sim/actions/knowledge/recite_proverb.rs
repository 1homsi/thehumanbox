//! Action 135: recite a proverb. Mild comfort bump for everyone nearby.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    for i in 0..ctx.near.len() {
        let ki = ctx.near[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.01).min(1.0);
    }
    ctx.think("reciting a proverb");
    ctx.discover("proverbs", "coined a proverb");
    0.002
}
