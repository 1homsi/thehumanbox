use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("milk", 1) {
        ctx.think("no steamed milk");
        return 0.005;
    }
    if ctx.good("drink") == 0 {
        ctx.think("no shot to pour into");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.add_comfort(0.02);
    ctx.think("pour latte art");
    ctx.event("chore", "poured latte art");
    0.05
}
