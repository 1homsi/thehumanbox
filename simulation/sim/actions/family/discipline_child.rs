//! Action 266: scold a young kin; their boredom -0.1; emit "social" event.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].age < 400);
    let Some(ki) = pick else {
        ctx.think("no child to discipline");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.boredom = (o.boredom - 0.10).max(0.0);
        o.comfort = (o.comfort - 0.04).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.02).min(1.0);
    ctx.think("disciplining a child");
    ctx.event("social", "scolded a child for misbehaving");
    0.004
}
