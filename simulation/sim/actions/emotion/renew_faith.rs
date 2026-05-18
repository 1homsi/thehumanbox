
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near && ctx.kin.is_empty() {
        ctx.think("struggling to find renewal alone in the dark");
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.07).min(1.0);
    ctx.think("feeling faith rekindled");
    ctx.discover("renewed_faith", "renewed their faith through community and sacred fire");
    ctx.event("ritual", "renewed their faith in a moment of warmth and togetherness");
    0.010
}
