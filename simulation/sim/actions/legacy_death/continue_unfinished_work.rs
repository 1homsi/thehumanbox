use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("carrying on what was left undone");
    ctx.org_mut().boredom = (ctx.org().boredom - 0.08).max(0.0);
    ctx.discover(
        "perseverance",
        "chose to carry on the work left behind by the fallen",
    );
    ctx.event(
        "culture",
        "the tribe continues the unfinished work of those who have passed",
    );
    0.008
}
