use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("transcribe eyewitness");
    ctx.event("life", "transcribe eyewitness");
    0.005
}
