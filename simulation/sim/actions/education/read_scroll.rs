
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().discoveries.contains("scroll_writing") { return 0.0; }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.10).max(0.0);
    ctx.think("absorbing the words of those who came before");
    ctx.discover("scroll_reading", "read a scroll and absorbed its knowledge");
    ctx.event("culture", "a scroll is read aloud to share its contents");
    0.008
}
