//! Action 226: give food to a nearby kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_food == 0 {
        ctx.think("nothing to give");
        return 0.0;
    }
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("no kin to gift");
        return 0.0;
    };
    ctx.sim.organisms[ctx.idx].inv_food -= 1;
    {
        let o = &mut ctx.sim.organisms[ki];
        o.energy = (o.energy + 0.08).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.05).min(1.0);
    ctx.think("sharing food with kin");
    ctx.event("social", "gifted food to kin");
    0.007
}
