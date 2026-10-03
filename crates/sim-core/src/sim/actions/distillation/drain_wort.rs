use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("mash", 1) {
        ctx.think("nothing to drain");
        return 0.005;
    }
    ctx.add_good("wash", 1);
    ctx.think("drain wort");
    ctx.event("chore", "drained the wort");
    0.05
}
