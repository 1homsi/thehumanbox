use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    if !ctx.rock_near {
        return 0.0;
    }
    ctx.think("gathering all that we know into one place");
    ctx.discover(
        "compendium",
        "compiled a comprehensive record of the tribe's knowledge",
    );
    ctx.event("build", "an elder compiles a compendium of all tribal knowledge");
    0.015
}
