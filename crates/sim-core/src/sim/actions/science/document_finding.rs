use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        return 0.0;
    }
    ctx.event("build", "documenting findings on stone");
    ctx.discover(
        "documentation",
        "began documenting knowledge for future generations",
    );
    0.008
}
