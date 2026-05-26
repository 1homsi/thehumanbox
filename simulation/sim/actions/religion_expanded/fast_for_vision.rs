use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().energy = (ctx.org().energy - 0.05).max(0.0);
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    ctx.event(
        "ritual",
        "fasting and entering a meditative state for divine vision",
    );
    ctx.discover("asceticism", "achieved transcendence through fasting");
    0.012
}
