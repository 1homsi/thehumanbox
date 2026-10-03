use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("standing watch alone");
        return 0.0;
    }
    let pick = ctx.kin.iter().copied().min_by(|&a, &b| {
        ctx.sim.organisms[a]
            .health
            .partial_cmp(&ctx.sim.organisms[b].health)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let Some(ki) = pick else {
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.06).min(1.0);
        o.health = (o.health + 0.02).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    ctx.think("protecting the family");
    ctx.event(
        "defense",
        "stood guard to protect the most vulnerable family member",
    );
    0.007
}
