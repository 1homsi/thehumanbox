use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    // Herbs grow among the wild food patches, and gathering one clears it.
    if !ctx.take_wild_food(1) {
        ctx.think("no herbs here");
        return 0.0;
    }
    ctx.think("harvesting medicinal herbs");
    ctx.discover("medicinal_herbs", "harvested medicinal herbs from the wild");
    0.010
}
