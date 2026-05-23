use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("meat", 1) {
        ctx.think("nothing to break down");
        return 0.005;
    }
    ctx.add_good("cuts", 1);
    ctx.think("break carcass");
    ctx.event("chore", "broke a carcass into primals");
    0.06
}
