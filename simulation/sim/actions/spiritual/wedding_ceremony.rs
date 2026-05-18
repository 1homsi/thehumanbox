//! Action 207: wedding ceremony. Needs 2+ kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 {
        ctx.think("dreaming of a wedding");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.06).min(1.0);
    }
    let bonus = 0.006 * ctx.kin.len().min(5) as f32;
    ctx.think("celebrating a wedding");
    ctx.discover("wedding", "held a wedding ceremony");
    bonus
}
