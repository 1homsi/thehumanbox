use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let here = ctx.sim.grid.elevation.get(ctx.fidx).copied().unwrap_or(0.0);
    if here >= 0.3 {
        ctx.think("walking the rim");
        return 0.0;
    }
    ctx.think("descending into the canyon");
    ctx.discover("canyons", "descended a canyon");
    0.005
}
