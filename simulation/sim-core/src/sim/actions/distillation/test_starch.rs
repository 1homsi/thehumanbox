use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("no mash to test");
        return 0.005;
    }
    ctx.add_literacy(0.005);
    ctx.think("test for starch");
    ctx.event("chore", "tested for unconverted starch");
    0.04
}
