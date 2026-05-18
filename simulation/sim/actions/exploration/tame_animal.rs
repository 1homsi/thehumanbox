
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (sx, sy) = (ctx.sx, ctx.sy);
    let near_animal = ctx.sim.animals.iter()
        .any(|a| a.alive && (a.x - sx).abs() + (a.y - sy).abs() <= 4.0);
    if !near_animal {
        ctx.think("searching for animals");
        return 0.0;
    }
    if ctx.chance(0.15) {
        ctx.think("taming an animal");
        ctx.discover("animal-taming", "tamed a wild animal");
        0.02
    } else {
        ctx.think("approaching an animal");
        0.0
    }
}
