
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.is_night() {
        ctx.think("awaiting dawn");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.02).min(1.0);
    }
    let bonus = 0.003 + 0.001 * ctx.kin.len().min(5) as f32;
    ctx.think("chanting at dawn");
    ctx.discover("dawn-chant", "chanted at dawn");
    bonus
}
