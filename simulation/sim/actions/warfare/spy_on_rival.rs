
use crate::organism::organism::Organism;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ms = ctx.org().traits.memory_strength;
    let (sx, sy) = (ctx.sx, ctx.sy);
    let lid = ctx.lid.clone();
    let hostiles: Vec<(i32, i32)> = ctx.sim.organisms.iter()
        .filter(|o| o.alive && o.lineage_id != lid)
        .filter(|o| (o.x - sx).abs() + (o.y - sy).abs() <= 14.0)
        .map(|o| (o.x as i32, o.y as i32))
        .collect();
    let spotted = hostiles.len();
    for (hx, hy) in hostiles {
        Organism::remember(
            &mut ctx.sim.organisms[ctx.idx].danger_memory, hx, hy, 0.35, ms,
        );
    }
    if spotted > 0 {
        ctx.think("spying on rivals");
        0.004
    } else {
        ctx.think("watching the horizon");
        0.0
    }
}
