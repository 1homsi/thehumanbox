use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("bottled_spirit", 1) && !ctx.take_good("aged_spirit", 1) {
        ctx.think("nothing to bottle");
        return 0.005;
    }
    ctx.add_good("bottle", 1);
    ctx.think("bottle proof");
    ctx.event("chore", "bottled a spirit");
    0.06
}
