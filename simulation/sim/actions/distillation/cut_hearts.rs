use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("spirit") == 0 {
        ctx.think("nothing to cut");
        return 0.005;
    }
    ctx.add_comfort(0.03);
    ctx.add_literacy(0.01);
    ctx.think("cut hearts");
    ctx.event("chore", "took the hearts");
    0.07
}
