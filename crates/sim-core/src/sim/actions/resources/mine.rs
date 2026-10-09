use super::super::ctx::ActionCtx;
use crate::sim::era::Era;
use crate::world::tiles::{Biome, Tile};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.rock_near && ctx.org().carry_room() > 0 {
        let o = ctx.org_mut();
        o.inv_stone = o.inv_stone.saturating_add(1);
        ctx.think("mining stone");
        ctx.discover("mining", "learned to mine");
        if ctx.biome() == Biome::Badlands {
            // Red earth in the badlands is ochre, a dye for cloth and walls.
            ctx.yield_land_good("ochre", 0.35);
        }
        let ore_seam = ctx.lineage_era_at_least(Era::Bronze)
            && [(-1, 0), (1, 0), (0, -1), (0, 1)]
                .iter()
                .any(|&(dx, dy)| ctx.sim.grid.get(ctx.ix + dx, ctx.iy + dy) == Tile::Mineral);
        if ore_seam {
            // Bronze-age tribes dig metal ore out of the mineral seams.
            ctx.yield_land_good("ore", 0.3);
        }
        0.012
    } else {
        ctx.think("looking for ore");
        0.0
    }
}
