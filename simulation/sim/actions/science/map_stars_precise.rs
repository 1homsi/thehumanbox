use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.tick % 2 != 1 {
        return 0.0;
    }
    ctx.event("build", "mapping stars with precision through the night");
    ctx.discover("star_map", "created a precise map of the stars");
    0.010
}
