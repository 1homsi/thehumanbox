
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.06).max(0.0);
    ctx.think("questioning what I thought I knew");
    ctx.discover("critical_inquiry", "challenged a long-held belief through reasoned argument");
    ctx.event("culture", "a belief is openly challenged, sparking debate");
    0.007
}
