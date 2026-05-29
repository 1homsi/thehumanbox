use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let grieving: Vec<usize> = ctx
        .kin
        .iter()
        .copied()
        .filter(|&k| ctx.sim.organisms[k].grief_ticks > 0)
        .collect();
    if grieving.is_empty() {
        ctx.think("remembering the lost");
        return 0.0;
    }
    for &ki in &grieving {
        let o = &mut ctx.sim.organisms[ki];
        o.grief_ticks = o.grief_ticks.saturating_sub(10);
        o.comfort = (o.comfort + 0.04).min(1.0);
    }
    ctx.think("mourning together");
    0.005
}
