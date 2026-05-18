
use crate::organism::organism::Organism;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ms = ctx.org().traits.memory_strength;
    let (sx, sy) = (ctx.sx, ctx.sy);
    let animals: Vec<(i32, i32)> = ctx.sim.animals.iter()
        .filter(|a| a.alive)
        .filter(|a| (a.x - sx).abs() + (a.y - sy).abs() <= 12.0)
        .map(|a| (a.x as i32, a.y as i32))
        .collect();
    let spotted = animals.len();
    for (ax, ay) in animals {
        Organism::remember(
            &mut ctx.sim.organisms[ctx.idx].food_memory, ax, ay, 0.35, ms,
        );
    }
    ctx.think("reading the tracks");
    if spotted > 0 {
        ctx.discover("tracking", "learned to read tracks");
        0.005
    } else { 0.0 }
}
