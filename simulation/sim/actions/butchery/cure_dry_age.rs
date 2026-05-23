use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("meat", 1) {
        ctx.think("nothing to cure");
        return 0.005;
    }
    ctx.add_good("preserved", 1);
    ctx.think("dry cure");
    ctx.event("chore", "dry-cured a cut");
    0.06
}
