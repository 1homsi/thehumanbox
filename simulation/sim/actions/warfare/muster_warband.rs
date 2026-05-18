
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let warband: Vec<usize> = ctx.kin.iter().copied()
        .filter(|&k| ctx.sim.organisms[k].age >= 800).collect();
    if warband.len() < 2 {
        ctx.think("calling for warriors");
        return 0.0;
    }
    for &ki in &warband {
        let o = &mut ctx.sim.organisms[ki];
        o.fear_level = (o.fear_level - 0.06).max(0.0);
    }
    let bonus = 0.004 * warband.len().min(6) as f32;
    ctx.think("mustering a warband");
    ctx.discover("warband-deep", "mustered a warband");
    bonus
}
