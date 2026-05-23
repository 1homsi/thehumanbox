use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("mash", 1) {
        ctx.think("no mash to ferment");
        return 0.005;
    }
    ctx.add_good("wash", 1);
    ctx.think("ferment mash");
    ctx.event("chore", "fermented mash into wash");
    0.06
}
