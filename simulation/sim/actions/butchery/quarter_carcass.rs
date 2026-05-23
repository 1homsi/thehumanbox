use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("nothing to quarter");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("quarter carcass");
    ctx.event("chore", "quartered a carcass");
    0.03
}
