use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    // Berries grow on the wild food patches; picking one clears it.
    if ctx.chance(0.6) && ctx.take_wild_food(2) {
        if matches!(
            ctx.biome(),
            crate::world::tiles::Biome::Jungle | crate::world::tiles::Biome::Savanna
        ) {
            // Hot ground grows spices, the luxury the cold tribes trade for.
            ctx.yield_land_good("spice", 0.3);
        }
        ctx.think("picking berries");
        ctx.discover("berry-picking", "found a berry patch");
        0.012
    } else {
        ctx.think("foraging for berries");
        0.0
    }
}
