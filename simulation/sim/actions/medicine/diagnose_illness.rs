use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("no patient to diagnose");
        return 0.0;
    };
    let health = ctx.sim.organisms[ki].health;
    let infection = ctx.sim.organisms[ki].infection;
    let diagnosis = if infection > 0.3 {
        "severe infection detected"
    } else if health < 0.3 {
        "critical condition - needs urgent care"
    } else if health < 0.6 {
        "mild illness - needs rest"
    } else {
        "patient appears stable"
    };
    ctx.sim.organisms[ctx.idx].boredom = (ctx.sim.organisms[ctx.idx].boredom - 0.05).max(0.0);
    ctx.think("diagnosing illness");
    ctx.event("medicine", diagnosis);
    0.006
}
