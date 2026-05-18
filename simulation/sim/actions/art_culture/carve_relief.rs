
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near { return 0.0; }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.07).max(0.0);
    ctx.think("carving a relief into the stone");
    ctx.discover("relief_carving", "carved the first stone relief");
    ctx.event("build", "chiseled images into the rock face");
    0.010
}
