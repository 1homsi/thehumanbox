use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("coffee") == 0 && ctx.good("drink") == 0 {
        ctx.think("nothing to cup");
        return 0.005;
    }
    ctx.add_literacy(0.005);
    ctx.think("cup-calibrate");
    ctx.event("chore", "cup-calibrate");
    0.04
}
