use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("ground", 1) {
        ctx.think("no ground meat for casings");
        return 0.005;
    }
    ctx.add_good("sausage", 1);
    ctx.think("case sausage");
    ctx.event("chore", "cased sausages");
    0.06
}
