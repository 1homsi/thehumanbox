use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    ctx.think("setting down my wishes before I pass");
    ctx.discover("written_will", "an elder wrote a will to pass on their estate");
    ctx.event("governance", "an elder documents their final wishes");
    0.010
}
