use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("wash", 2) {
        ctx.think("not enough wash for a spirit run");
        return 0.005;
    }
    ctx.add_good("spirit", 1);
    ctx.discover("distilling", "completed a spirit run");
    ctx.think("spirit run");
    ctx.event("chore", "ran a clean spirit run");
    0.12
}
