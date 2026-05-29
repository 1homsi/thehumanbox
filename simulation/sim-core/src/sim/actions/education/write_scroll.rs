use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("inscribing knowledge onto bark");
    ctx.discover("scroll_writing", "created the first written scroll");
    ctx.event("build", "a scroll is written to preserve knowledge");
    0.010
}
