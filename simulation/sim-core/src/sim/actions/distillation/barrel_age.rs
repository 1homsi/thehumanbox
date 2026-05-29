use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("spirit", 1) {
        ctx.think("nothing to barrel");
        return 0.005;
    }
    ctx.add_good("aged_spirit", 1);
    ctx.think("barrel age");
    ctx.event("chore", "laid a barrel down to age");
    0.08
}
