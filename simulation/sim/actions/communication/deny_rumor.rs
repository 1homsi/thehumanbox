use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("setting the record straight");
    ctx.event("social", "publicly denied a rumour to restore their reputation");
    0.004
}
