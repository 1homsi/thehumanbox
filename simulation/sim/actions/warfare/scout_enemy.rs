use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ms = ctx.org().traits.memory_strength;
    let (sx, sy) = (ctx.sx, ctx.sy);
    let lid = ctx.lid.clone();
    let hostiles: Vec<(i32, i32)> = ctx
        .sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id != lid)
        .filter(|o| (o.x - sx).abs() + (o.y - sy).abs() <= 18.0)
        .map(|o| (o.x as i32, o.y as i32))
        .collect();
    let mut spotted = 0u32;
    for (hx, hy) in hostiles {
        let nearest = ctx.sim.nearest_lineage_at(hx, hy).unwrap_or_default();
        if ctx.sim.organisms[ctx.idx].attitude_toward(&nearest) < -0.2 {
            Organism::remember(&mut ctx.sim.organisms[ctx.idx].danger_memory, hx, hy, 0.5, ms);
            spotted += 1;
        }
    }
    ctx.think("scouting the enemy");
    if spotted > 0 {
        0.005
    } else {
        0.0
    }
}
