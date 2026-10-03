use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 || ctx.good("seeds") >= 8 {
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.add_good("seeds", 2);
    ctx.think("planning ahead by saving seeds");
    ctx.discover("seed_saving", "learned to save seeds for next season");
    ctx.event("build", "carefully selected and stored seeds for next planting");
    0.008
}
