use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    if ctx.org().discoveries.is_empty() {
        return 0.0;
    }
    ctx.event("build", "formalising a repeatable methodology for investigation");
    ctx.discover("scientific_method", "established the scientific method");
    0.020
}
