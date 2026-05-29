use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx
        .kin
        .iter()
        .copied()
        .find(|&ki| ctx.sim.organisms[ki].age < 400);
    let Some(ki) = pick else {
        ctx.think("no child to praise");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.08).min(1.0);
        o.boredom = (o.boredom - 0.05).max(0.0);
        o.energy = (o.energy + 0.03).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.04).min(1.0);
    ctx.think("praising a child");
    ctx.discover("parenting", "discovered the power of praising children");
    0.010
}
