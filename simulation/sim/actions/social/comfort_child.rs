//! Action 81: comfort the youngest child kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .filter(|&k| ctx.sim.organisms[k].age < 600)
        .min_by_key(|&k| ctx.sim.organisms[k].age);
    let Some(ki) = pick else {
        ctx.think("watching over the young");
        return 0.0;
    };
    let o = &mut ctx.sim.organisms[ki];
    o.fear_level = (o.fear_level - 0.08).max(0.0);
    o.comfort = (o.comfort + 0.06).min(1.0);
    ctx.think("comforting a child");
    0.006
}
