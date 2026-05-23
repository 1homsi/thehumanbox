use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("sausage", 1) {
        ctx.think("no sausages to smoke");
        return 0.005;
    }
    ctx.add_good("preserved", 1);
    ctx.think("smoke sausage");
    ctx.event("chore", "hot-smoked sausages");
    0.07
}
