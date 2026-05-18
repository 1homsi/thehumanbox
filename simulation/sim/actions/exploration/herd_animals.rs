
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (sx, sy) = (ctx.sx, ctx.sy);
    let near_animal = ctx.sim.animals.iter()
        .any(|a| a.alive && (a.x - sx).abs() + (a.y - sy).abs() <= 6.0);
    if !near_animal {
        ctx.think("looking for a herd");
        return 0.0;
    }
    ctx.think("herding animals");
    ctx.discover("herding", "began herding animals");
    0.006
}
