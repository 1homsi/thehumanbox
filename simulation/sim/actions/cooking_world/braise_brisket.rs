use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("braise brisket");
    ctx.event("life", "braise brisket");
    0.005
}
