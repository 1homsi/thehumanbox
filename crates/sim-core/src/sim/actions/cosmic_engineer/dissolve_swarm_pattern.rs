use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    ctx.think("dissolve swarm pattern");
    ctx.event("life", "dissolve swarm pattern");
    0.005
}
