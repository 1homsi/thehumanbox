use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    ctx.think("marking the years by counting the seasons");
    ctx.discover("season_counting", "developed a system for counting the seasons");
    ctx.event("build", "an elder marks the passage of seasons");
    0.008
}
