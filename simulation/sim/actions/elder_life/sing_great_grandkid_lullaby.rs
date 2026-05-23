use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("sing great grandkid lullaby");
    ctx.event("chore", "sing great grandkid lullaby");
    0.005
}
