use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 || !ctx.rock_near {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.event("build", "crafting a measuring tool from wood and stone");
    ctx.discover("measurement_tool", "built first measuring tool");
    0.012
}
