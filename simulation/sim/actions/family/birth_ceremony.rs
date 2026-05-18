//! Action 262: celebrate a newborn; all kin comfort +0.07; discover "birth_rite".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no family to celebrate with");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.07).min(1.0);
        o.boredom = (o.boredom - 0.06).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.07).min(1.0);
    let bonus = 0.004 * ctx.kin.len().min(5) as f32;
    ctx.think("celebrating a birth");
    ctx.discover("birth_rite", "held a birth ceremony for the newborn");
    bonus + 0.008
}
