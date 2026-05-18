//! Action 239: guard a low-health kin nearby; boost their health slightly.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].health < 0.5);
    let Some(ki) = pick else {
        ctx.think("all kin are safe");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.health = (o.health + 0.04).min(1.0);
        o.comfort = (o.comfort + 0.05).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    ctx.think("protecting a vulnerable kin");
    ctx.event("social", "stood guard over a weakened kin");
    0.007
}
