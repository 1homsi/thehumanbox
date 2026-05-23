use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("wash") == 0 && ctx.good("mash") == 0 {
        ctx.think("nothing to taste");
        return 0.005;
    }
    ctx.add_comfort(0.02);
    ctx.think("taste wort");
    ctx.event("chore", "tasted the wort");
    0.04
}
