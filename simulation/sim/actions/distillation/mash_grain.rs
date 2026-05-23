use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 {
        ctx.think("no grain to mash");
        return 0.005;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.add_good("mash", 1);
    ctx.think("mash grain");
    ctx.event("chore", "mashed grain into wort");
    0.05
}
