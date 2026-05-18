
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_food == 0 {
        ctx.think("nothing to share for a family meal");
        return 0.0;
    }
    if ctx.kin.is_empty() {
        ctx.think("no family to eat with");
        return 0.0;
    }
    ctx.sim.organisms[ctx.idx].inv_food -= 1;
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.energy  = (o.energy  + 0.04).min(1.0);
        o.comfort = (o.comfort + 0.04).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].energy  = (ctx.sim.organisms[ctx.idx].energy  + 0.04).min(1.0);
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.05).min(1.0);
    let bonus = 0.003 * ctx.kin.len().min(5) as f32;
    ctx.think("sharing a family meal");
    ctx.event("social", "shared a meal with the whole family");
    bonus + 0.006
}
