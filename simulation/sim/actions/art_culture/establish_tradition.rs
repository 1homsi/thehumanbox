
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder || ctx.kin.len() < 2 { return 0.0; }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.04).min(1.0);
    }
    ctx.think("establishing a tradition");
    ctx.discover("tradition", "codified the first tradition");
    ctx.event("culture", "an elder established a lasting tradition");
    0.015
}
