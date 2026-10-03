use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("no mash to test");
        return 0.005;
    }
    ctx.add_literacy(0.005);
    ctx.think("test iodine");
    ctx.event("chore", "ran an iodine test");
    0.04
}
