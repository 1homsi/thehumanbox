use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("spirit", 1) {
        ctx.think("nothing to proof");
        return 0.005;
    }
    ctx.add_good("bottled_spirit", 1);
    ctx.think("dilute to proof");
    ctx.event("chore", "proofed a spirit");
    0.06
}
