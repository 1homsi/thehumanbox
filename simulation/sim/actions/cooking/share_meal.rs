
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 || ctx.kin.is_empty() { return 0.0; }
    ctx.org_mut().inv_food -= 1;
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.energy = (o.energy + 0.10).min(1.0);
    }
    let bonus = 0.005 * ctx.kin.len().min(5) as f32;
    ctx.think("sharing a meal");
    bonus
}
