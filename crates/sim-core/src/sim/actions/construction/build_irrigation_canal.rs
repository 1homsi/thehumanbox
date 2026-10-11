use super::super::ctx::ActionCtx;
use crate::sim::simulation::Simulation;
use crate::world::grid::{WorldGrid, ROAD_CANAL, ROAD_NONE};
use crate::world::tiles::Tile;

/// Cells a dug channel runs inland from the water's edge.
pub(crate) const CANAL_LENGTH: i32 = 6;

const STEPS: [(i32, i32); 4] = [(1, 0), (0, 1), (-1, 0), (0, -1)];

/// The cardinal step from `(x, y)` towards water that lies within two cells that way, if any.
fn water_side(sim: &Simulation, x: i32, y: i32) -> Option<(i32, i32)> {
    STEPS
        .into_iter()
        .find(|&(dx, dy)| (1..=2).any(|k| sim.grid.get(x + dx * k, y + dy * k) == Tile::Water))
}

/// Digs a channel of up to `CANAL_LENGTH` cells that starts at `(x, y)` and runs away from the water
/// beside it, over open grass nobody has built or cut. Returns how many cells it dug (0 when there is no
/// water to draw from, or the ground is not open).
pub(crate) fn dig_canal(sim: &mut Simulation, x: i32, y: i32) -> usize {
    let Some((wx, wy)) = water_side(sim, x, y) else {
        return 0;
    };
    let mut dug = 0;
    for k in 0..CANAL_LENGTH {
        let (cx, cy) = (x - wx * k, y - wy * k);
        if sim.grid.get(cx, cy) != Tile::Grass || sim.grid.road_at(cx, cy) != ROAD_NONE {
            break;
        }
        sim.grid.road[WorldGrid::idx(cx, cy)] = ROAD_CANAL;
        dug += 1;
    }
    dug
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || !matches!(ctx.tile, Tile::Grass) {
        return 0.0;
    }
    let (ix, iy) = (ctx.ix, ctx.iy);
    if dig_canal(ctx.sim, ix, iy) == 0 {
        return 0.0;
    }
    for dx in -3..=3 {
        for dy in -3..=3 {
            let i2 = WorldGrid::idx(ix + dx, iy + dy);
            if i2 < ctx.sim.grid.fertility.len() {
                ctx.sim.grid.fertility[i2] = (ctx.sim.grid.fertility[i2] + 0.04).min(0.96);
            }
        }
    }
    ctx.think("cutting an irrigation canal");
    ctx.discover("canals", "cut an irrigation canal");
    0.014
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A small open world: grass everywhere near (100, 100), water two cells west of it.
    fn shore() -> Simulation {
        let mut sim = Simulation::new(7);
        for y in 90..110 {
            for x in 90..120 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for y in 95..106 {
            sim.grid.set(98, y, Tile::Water);
        }
        sim
    }

    #[test]
    fn a_channel_runs_inland_from_the_water() {
        let mut sim = shore();
        assert_eq!(dig_canal(&mut sim, 100, 100), CANAL_LENGTH as usize);
        for k in 0..CANAL_LENGTH {
            assert_eq!(
                sim.grid.road_at(100 + k, 100),
                ROAD_CANAL,
                "cell {k} is not a channel"
            );
        }
        assert_eq!(
            sim.grid.road_at(99, 100),
            ROAD_NONE,
            "the channel went back towards the water"
        );
        assert_eq!(sim.grid.get(98, 100), Tile::Water, "the water was changed");
    }

    #[test]
    fn no_channel_without_water_or_on_built_ground() {
        let mut dry = shore();
        for y in 95..106 {
            dry.grid.set(98, y, Tile::Grass);
        }
        assert_eq!(dig_canal(&mut dry, 100, 100), 0, "dug with no water to draw from");

        let mut built = shore();
        built.grid.road[WorldGrid::idx(102, 100)] = crate::world::grid::ROAD_TRACK;
        assert_eq!(dig_canal(&mut built, 100, 100), 2, "a channel ran through a road");
        assert_eq!(built.grid.road_at(102, 100), crate::world::grid::ROAD_TRACK);
    }
}
