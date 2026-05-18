//! Action 88: boast. Self-comfort up, near-comfort down.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    for i in 0..ctx.near.len() {
        let ki = ctx.near[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort - 0.01).max(0.0);
    }
    ctx.think("boasting");
    0.002
}
