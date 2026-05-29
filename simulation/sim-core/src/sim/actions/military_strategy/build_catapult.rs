use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 || ctx.org().inv_stone == 0 {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().inv_stone -= 1;
    ctx.event("build", "engineering a catapult for siege warfare");
    ctx.discover("catapult", "built the first catapult");
    0.050
}
