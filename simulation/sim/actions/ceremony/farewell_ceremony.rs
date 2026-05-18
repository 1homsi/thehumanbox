
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    if ctx.org().health > 0.3 { return 0.0; }
    if ctx.kin.is_empty() { return 0.0; }
    ctx.think("accepting farewell with grace as the tribe gathers close");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort - 0.03).max(0.0);
        o.comfort = (o.comfort + 0.05).min(1.0);
    }
    ctx.event("culture", "the tribe holds a farewell ceremony for a beloved elder");
    0.010
}
