use super::*;

/// Ice forms and melts once every this many ticks.
pub const ICE_EVERY: u64 = 30;
/// Below this temperature (the season's, see `season_temperature`) shallow water freezes.
pub const FREEZE_BELOW: f32 = -6.0;
/// Above this temperature ice melts back to water. The gap between the two keeps a thaw from flickering.
pub const THAW_ABOVE: f32 = -3.0;
/// Chance a shallow water tile freezes on a pass in the cold.
const FREEZE_CHANCE: f32 = 0.1;
/// Chance an ice tile melts on a pass in the warmth.
const THAW_CHANCE: f32 = 0.1;

/// Shallow water: a water tile with land on a side. Ice does not count as land, so a frozen shore
/// does not freeze the open water beside it.
fn shore_beside(grid: &WorldGrid, x: i32, y: i32) -> bool {
    [(1, 0), (-1, 0), (0, 1), (0, -1)]
        .iter()
        .any(|&(dx, dy)| !matches!(grid.get(x + dx, y + dy), Tile::Water | Tile::Ice | Tile::Void))
}

/// Freezing and thawing, once every `ICE_EVERY` ticks. In the cold, shallow water (water with dry
/// land beside it) freezes a tile at a time; deep water stays open. In the warmth, ice goes back to
/// water. The RNG is only drawn for tiles that change, so a world with no water in the cold or no
/// ice in the warm keeps its random sequence.
pub fn tick_ice(grid: &mut WorldGrid, temperature: f32, tick: u64, rng: &mut impl Rng) {
    if !tick.is_multiple_of(ICE_EVERY) {
        return;
    }
    let freezing = temperature < FREEZE_BELOW;
    let thawing = temperature > THAW_ABOVE;
    if !freezing && !thawing {
        return;
    }
    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            match grid.get(x, y) {
                Tile::Water if freezing && shore_beside(grid, x, y) => {
                    if rng.random::<f32>() < FREEZE_CHANCE {
                        grid.set(x, y, Tile::Ice);
                    }
                }
                Tile::Ice if thawing && rng.random::<f32>() < THAW_CHANCE => {
                    grid.set(x, y, Tile::Water);
                }
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod ice_tests {
    use super::*;

    #[test]
    fn ice_is_walkable_and_not_water() {
        assert!(Tile::Ice.walkable());
        assert!(!Tile::Ice.flammable());
        assert_eq!(Tile::from_i8(15), Tile::Ice);
    }

    /// A strip of shallow water (dry land on its north side) and a deep patch of water well inside a lake.
    fn lake() -> WorldGrid {
        use crate::world::grid::{HEIGHT, WIDTH};
        let mut grid = WorldGrid::new(42);
        for x in 0..WIDTH as i32 {
            for y in 0..HEIGHT as i32 {
                grid.set(x, y, Tile::Grass);
            }
        }
        for x in 100..120 {
            grid.set(x, 50, Tile::Water);
            grid.set(x, 51, Tile::Water);
        }
        for x in 200..210 {
            for y in 200..210 {
                grid.set(x, y, Tile::Water);
            }
        }
        grid
    }

    #[test]
    fn shallow_water_freezes_in_the_cold_and_deep_water_does_not() {
        use rand::SeedableRng;
        let mut grid = lake();
        let mut rng = rand::rngs::StdRng::seed_from_u64(3);
        for pass in 1..=300 {
            tick_ice(&mut grid, -12.0, pass * ICE_EVERY, &mut rng);
        }
        assert!(
            (100..120).any(|x| grid.get(x, 50) == Tile::Ice),
            "the shore freezes"
        );
        assert_eq!(grid.get(205, 205), Tile::Water, "deep water stays open");
    }

    #[test]
    fn ice_melts_back_to_water_when_it_warms() {
        use rand::SeedableRng;
        let mut grid = lake();
        let mut rng = rand::rngs::StdRng::seed_from_u64(5);
        for x in 100..120 {
            grid.set(x, 50, Tile::Ice);
        }
        for pass in 1..=400 {
            tick_ice(&mut grid, 3.0, pass * ICE_EVERY, &mut rng);
        }
        assert!(
            (100..120).all(|x| grid.get(x, 50) == Tile::Water),
            "the ice melts"
        );
    }

    #[test]
    fn the_gap_between_freezing_and_thawing_holds_the_ice() {
        use rand::SeedableRng;
        let mut grid = lake();
        let mut rng = rand::rngs::StdRng::seed_from_u64(9);
        grid.set(110, 50, Tile::Ice);
        for pass in 1..=200 {
            tick_ice(&mut grid, -4.0, pass * ICE_EVERY, &mut rng);
        }
        assert_eq!(
            grid.get(110, 50),
            Tile::Ice,
            "a decline season neither freezes nor thaws"
        );
    }
}
