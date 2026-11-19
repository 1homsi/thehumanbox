use super::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::{Biome, Tile};

pub const BLANK_SEA: i32 = 12;
const BLANK_BEACH: i32 = 2;
const BLANK_LAND: f32 = 0.4;
const BLANK_TEMPERATURE: f32 = 18.0;

impl WorldGrid {
    pub fn blank() -> Self {
        let mut g = Self::bare::<WIDTH, HEIGHT>();
        let fertility = Biome::Grassland.base_fertility();
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                let i = Self::idx(x, y);
                let shore = x.min(WIDTH as i32 - 1 - x).min(y).min(HEIGHT as i32 - 1 - y);
                g.biome[i] = Biome::Grassland as u8;
                g.temperature[i] = BLANK_TEMPERATURE;
                if shore < BLANK_SEA {
                    let below = 1.0 - shore as f32 / BLANK_SEA as f32;
                    g.tiles[i] = Tile::Water as i8;
                    g.elevation[i] = 0.28 - below * 0.2;
                    g.depth[i] = 0.15 + below * 0.6;
                    g.fertility[i] = 0.0;
                } else {
                    let beach = shore < BLANK_SEA + BLANK_BEACH;
                    g.tiles[i] = if beach { Tile::Sand } else { Tile::Grass } as i8;
                    g.elevation[i] = if beach { 0.32 } else { BLANK_LAND };
                    g.fertility[i] = fertility;
                }
            }
        }
        g
    }
}

#[cfg(test)]
mod tests {
    use super::BLANK_SEA;
    use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
    use crate::world::tiles::{Biome, Tile};

    #[test]
    fn a_blank_world_is_flat_grassland_inside_a_ring_of_sea() {
        let g = WorldGrid::blank();
        let (cx, cy) = (WIDTH as i32 / 2, HEIGHT as i32 / 2);
        assert_eq!(g.get(cx, cy), Tile::Grass);
        assert_eq!(g.biome_at(cx, cy), Biome::Grassland);
        assert_eq!(g.get(0, 0), Tile::Water);
        assert_eq!(g.get(BLANK_SEA - 1, cy), Tile::Water);
        assert_eq!(g.get(BLANK_SEA, cy), Tile::Sand);
        assert!(g.volcanoes.is_empty());
        let land: Vec<f32> = (BLANK_SEA + 2..WIDTH as i32 - BLANK_SEA - 2)
            .map(|x| g.elevation[WorldGrid::idx(x, cy)])
            .collect();
        assert!(land.iter().all(|&e| e == land[0]));
        let mut kinds: Vec<i8> = g.tiles.clone();
        kinds.sort_unstable();
        kinds.dedup();
        assert_eq!(
            kinds,
            vec![Tile::Grass as i8, Tile::Water as i8, Tile::Sand as i8]
        );
    }

    #[test]
    fn a_blank_simulation_has_no_one_and_keeps_its_flat_land_through_a_save() {
        use crate::sim::simulation::Simulation;
        let mut sim = Simulation::new_blank(5);
        assert!(sim.organisms.is_empty());
        assert!(sim.animals.is_empty());
        assert!(sim.buildings.is_empty());
        sim.tick_n(20);
        assert!(sim.organisms.is_empty());
        let mut reloaded = Simulation::from_save(5, sim.to_save_state());
        assert_eq!(reloaded.grid.tiles, sim.grid.tiles);
        assert_eq!(reloaded.grid.elevation, sim.grid.elevation);
        assert!(reloaded.grid.all_volcanoes().next().is_none());
        let family = serde_json::json!({"cmd": "family", "x": WIDTH as f32 / 2.0, "y": HEIGHT as f32 / 2.0});
        assert!(reloaded.apply_command_json(&family.to_string()));
        assert!(reloaded.organisms.iter().any(|o| o.alive));
    }
}
