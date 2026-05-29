use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("wash", 1) {
        ctx.think("nothing to condense");
        return 0.005;
    }
    ctx.add_good("spirit", 1);
    ctx.think("condense run");
    ctx.event("chore", "condensed the distillate");
    0.07
}
