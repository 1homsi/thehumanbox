use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (sx, sy) = (ctx.sx, ctx.sy);
    let near_animal = ctx
        .sim
        .animals
        .iter()
        .any(|a| a.alive && (a.x - sx).abs() + (a.y - sy).abs() <= 5.0);
    if !near_animal {
        ctx.think("waiting for wildlife");
        return 0.0;
    }
    ctx.think("studying an animal");
    ctx.discover("ethology", "studied animal behaviour");
    0.004
}
