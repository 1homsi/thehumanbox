use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("wash", 1) {
        ctx.think("no wash to distill");
        return 0.005;
    }
    ctx.add_good("spirit", 1);
    ctx.think("distill wash");
    ctx.event("chore", "ran a rough distillation");
    0.08
}
