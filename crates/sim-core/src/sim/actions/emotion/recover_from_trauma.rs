use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().health > 0.6 {
        ctx.think("wounds already healed");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.health = (o.health + 0.03).min(1.0);
    o.comfort = (o.comfort + 0.05).min(1.0);
    ctx.think("healing slowly from past wounds");
    ctx.discover("resilience", "recovered from deep trauma and found resilience");
    0.010
}
