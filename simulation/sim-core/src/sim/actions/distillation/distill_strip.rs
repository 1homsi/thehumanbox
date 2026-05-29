use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("wash", 1) {
        ctx.think("no wash for a stripping run");
        return 0.005;
    }
    ctx.add_good("spirit", 1);
    ctx.think("strip run");
    ctx.event("chore", "ran a stripping pass");
    0.07
}
