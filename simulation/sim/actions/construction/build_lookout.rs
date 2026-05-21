use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;
use super::super::ctx::{ActionCtx, BuildSpec};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Water | Tile::Flooded | Tile::Void) { return 0.0; }
    let elev = ctx.sim.grid.elevation[WorldGrid::idx(ctx.ix, ctx.iy)];
    if !ctx.rock_near && elev <= 0.7 { return 0.0; }
    ctx.build_one(BuildSpec {
        need_stone:    true,
        structure_add: 0.06,
        mark_active:   true,
        thought:       "raising a lookout",
        discovery:     "scouting",
        event_msg:     "raised a lookout",
        reward:        0.010,
        ..Default::default()
    })
}
