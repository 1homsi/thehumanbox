use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near && !ctx.water_near {
        return 0.0;
    }
    ctx.event("build", "establishing a lookout post for early warning");
    ctx.discover("lookout_post", "built the first dedicated lookout post");
    0.012
}
