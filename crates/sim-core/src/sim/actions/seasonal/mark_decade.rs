use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    if ctx.kin.len() < 3 {
        return 0.0;
    }
    ctx.think("commemorating a decade of seasons with the tribe");
    ctx.discover("decade_marking", "marked the passage of a decade with ceremony");
    ctx.event(
        "culture",
        "an elder leads the tribe in marking ten years of seasons",
    );
    0.012
}
