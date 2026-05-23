use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("pattern", 1) {
        ctx.think("no pattern to cut");
        return 0.005;
    }
    ctx.add_good("piece", 1);
    ctx.think("cut fabric");
    ctx.event("chore", "cut pattern pieces");
    0.05
}
