//! Action 206: burial rite. Eases grief for grieving kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let grieving: Vec<usize> = ctx.kin.iter().copied()
        .filter(|&k| ctx.sim.organisms[k].grief_ticks > 0).collect();
    if grieving.is_empty() {
        ctx.think("honouring the lost");
        return 0.0;
    }
    for &ki in &grieving {
        let o = &mut ctx.sim.organisms[ki];
        o.grief_ticks = o.grief_ticks.saturating_sub(30);
        o.comfort = (o.comfort + 0.05).min(1.0);
    }
    ctx.think("performing a burial rite");
    ctx.discover("burial-rite", "buried the dead with honour");
    0.006
}
