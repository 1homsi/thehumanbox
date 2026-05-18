//! Action 257: combine materials to create cure; reduce own infection.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_mats = ctx.sim.organisms[ctx.idx].inv_food > 0
        && ctx.sim.organisms[ctx.idx].inv_wood > 0;
    if !has_mats {
        ctx.think("need food and wood to mix antidote");
        return 0.0;
    }
    ctx.sim.organisms[ctx.idx].inv_food -= 1;
    ctx.sim.organisms[ctx.idx].inv_wood -= 1;
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.infection = (me.infection - 0.15).max(0.0);
        me.health    = (me.health    + 0.05).min(1.0);
    }
    ctx.think("mixing an antidote");
    ctx.discover("antidote_mixture", "mixed a powerful antidote from gathered materials");
    0.015
}
