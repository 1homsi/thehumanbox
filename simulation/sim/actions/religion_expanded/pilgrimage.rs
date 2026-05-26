use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().energy = (ctx.org().energy + 0.02).min(1.0);
    ctx.event("ritual", "journeying on pilgrimage to seek sacred ground");
    ctx.discover("pilgrimage", "completed a sacred pilgrimage");
    0.012
}
