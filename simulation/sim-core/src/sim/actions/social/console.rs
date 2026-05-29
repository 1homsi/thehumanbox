use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx
        .kin
        .iter()
        .copied()
        .max_by_key(|&k| ctx.sim.organisms[k].grief_ticks);
    let Some(ki) = pick else {
        ctx.think("looking for someone to comfort");
        return 0.0;
    };
    let o = &mut ctx.sim.organisms[ki];
    o.grief_ticks = o.grief_ticks.saturating_sub(20);
    o.comfort = (o.comfort + 0.06).min(1.0);
    ctx.think("consoling kin");
    0.006
}
