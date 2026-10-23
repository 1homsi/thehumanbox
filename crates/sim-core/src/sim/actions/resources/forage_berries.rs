use super::super::ctx::ActionCtx;
use crate::organism::skills::{success_chance, Skill};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    // Berries grow on the wild food patches; picking one clears it.
    // A practised forager knows which bushes are ripe and finds more on each.
    let level = ctx.org().skills.level(Skill::Foraging);
    let picked = ctx.chance(success_chance(0.6, level)) && ctx.take_wild_food(2);
    let extra = ctx.practised(Skill::Foraging, picked);
    if picked {
        let o = ctx.org_mut();
        o.inv_food = o.inv_food.saturating_add(extra);
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
