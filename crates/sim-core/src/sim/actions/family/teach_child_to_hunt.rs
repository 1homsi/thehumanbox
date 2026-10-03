use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.sim.organisms[ctx.idx].is_elder {
        ctx.think("only elders can teach hunting");
        return 0.0;
    }
    let pick = ctx
        .kin
        .iter()
        .copied()
        .find(|&ki| ctx.sim.organisms[ki].age < 400);
    let Some(ki) = pick else {
        ctx.think("no young kin to teach");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.energy = (o.energy + 0.05).min(1.0);
        o.boredom = (o.boredom - 0.10).max(0.0);
        o.comfort = (o.comfort + 0.04).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.04).min(1.0);
    ctx.think("teaching a child to hunt");
    ctx.discover("hunting_taught", "taught a child the art of hunting");
    0.015
}
