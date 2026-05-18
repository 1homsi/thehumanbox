
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 || !ctx.rock_near { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    ctx.event("build", "fortifying walls with cut stone");
    ctx.discover("wall_fortification", "built the first fortified stone wall");
    0.015
}
