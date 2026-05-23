use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("cuts", 1) {
        ctx.think("nothing to grind");
        return 0.005;
    }
    ctx.add_good("ground", 1);
    ctx.think("grind brisket");
    ctx.event("chore", "ground grind brisket");
    0.05
}
