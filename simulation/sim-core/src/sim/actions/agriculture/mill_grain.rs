use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near || ctx.org().inv_food == 0 {
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().energy = (ctx.org().energy + 0.12).min(1.0);
    ctx.think("milling grain into flour");
    ctx.discover("milling", "ground grain into flour for the first time");
    ctx.event("build", "milled grain using a stone grindstone");
    0.010
}
