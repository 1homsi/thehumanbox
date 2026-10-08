use super::*;
use crate::world::tiles::Biome;

impl Simulation {
    /// The eraser: ground inside the radius goes back to what its biome would
    /// hold. Water drains, fire and ash cool to ground, and sand or snow that
    /// the biome does not hold turns to grass. Rock, buildings and food stay.
    pub(super) fn cmd_restore(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, 24);
        let mut restored = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                if dx * dx + dy * dy > r * r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let tile = self.grid.get(nx, ny);
                if !matches!(
                    tile,
                    Tile::Water | Tile::Fire | Tile::Ash | Tile::Sand | Tile::Snow
                ) {
                    continue;
                }
                let roll = self.rng.random::<f32>();
                let ground = match self.grid.biome_at(nx, ny) {
                    Biome::Desert | Biome::Badlands => Tile::Sand,
                    Biome::Tundra if roll < 0.4 => Tile::Snow,
                    Biome::Taiga if roll < 0.15 => Tile::Snow,
                    _ => Tile::Grass,
                };
                self.grid.set(nx, ny, ground);
                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                restored += 1;
            }
        }
        restored > 0
    }
}
