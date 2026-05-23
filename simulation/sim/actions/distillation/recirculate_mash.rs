use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("no mash to recirculate");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("recirculate mash");
    ctx.event("chore", "recirculated the mash");
    0.03
}
