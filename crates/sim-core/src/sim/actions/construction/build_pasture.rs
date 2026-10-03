use super::super::ctx::{ActionCtx, BuildSpec};
use crate::world::tiles::{Biome, Tile};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.grid.biome_at(ctx.ix, ctx.iy) != Biome::Grassland {
        return 0.0;
    }
    let (ix, iy) = (ctx.ix, ctx.iy);
    let grass_near =
        (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| matches!(ctx.sim.grid.get(ix + dx, iy + dy), Tile::Grass)));
    if !grass_near {
        return 0.0;
    }
    ctx.build_one(BuildSpec {
        need_wood: true,
        structure_add: 0.05,
        mark_active: true,
        thought: "fencing a pasture",
        discovery: "animal-rearing",
        event_msg: "opened a pasture",
        reward: 0.012,
        ..Default::default()
    })
}
