use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 || !ctx.rock_near {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("building a greenhouse");
    ctx.discover("greenhouse", "constructed the first greenhouse");
    ctx.event("build", "built a greenhouse for year-round growing");
    0.015
}
