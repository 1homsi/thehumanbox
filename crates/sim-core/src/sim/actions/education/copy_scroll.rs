use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 {
        return 0.0;
    }
    if !ctx.org().discoveries.contains("scroll_writing") {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("making a copy so knowledge can spread");
    ctx.discover("scroll_copying", "copied a scroll to spread knowledge further");
    ctx.event("build", "a scroll is copied to preserve and share knowledge");
    0.008
}
