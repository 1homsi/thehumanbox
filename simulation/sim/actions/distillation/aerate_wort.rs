use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("no wort to aerate");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("aerate wort");
    ctx.event("chore", "aerated the wort");
    0.03
}
