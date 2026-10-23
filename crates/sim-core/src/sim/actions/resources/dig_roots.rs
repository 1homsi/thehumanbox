use super::super::ctx::ActionCtx;
use crate::organism::skills::{success_chance, Skill};
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let on_grass = matches!(ctx.tile, Tile::Grass);
    let level = ctx.org().skills.level(Skill::Foraging);
    let found = on_grass && ctx.chance(success_chance(0.25, level));
    let extra = if on_grass {
        ctx.practised(Skill::Foraging, found)
    } else {
        0
    };
    if found {
        let o = ctx.org_mut();
        o.energy = (o.energy + 0.12 + 0.06 * extra as f32).min(1.0);
        if ctx.biome() == crate::world::tiles::Biome::Wetland {
            // Wet ground under the roots is clay for pots.
            ctx.yield_land_good("clay", 0.6);
        }
        ctx.think("digging up roots");
        ctx.discover("root-digging", "learned to dig roots");
        0.01
    } else {
        ctx.think("digging for roots");
        0.0
    }
}
