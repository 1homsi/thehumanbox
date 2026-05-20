
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 || ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().inv_stone -= 1;
    ctx.event("build", "constructing a siege weapon from timber and stone");
    ctx.discover("siege_weapon", "built a siege weapon for the first time");
    0.045
}
