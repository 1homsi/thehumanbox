use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("no wort to dose");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("dose nutrient");
    ctx.event("chore", "added yeast nutrient");
    0.03
}
