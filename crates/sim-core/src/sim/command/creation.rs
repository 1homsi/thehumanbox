use super::*;

impl Simulation {
    pub(super) fn cmd_spawn(&mut self, x: f32, y: f32, count: u32, lineage: Option<String>) -> bool {
        let n = count.clamp(1, 50);
        let lid = lineage
            .filter(|lineage| !lineage.is_empty())
            .map(|l| {
                // A caller-supplied lineage id reaches byte-slicing
                // sites (`&lid[..6]`) in the log/telemetry paths, so
                // clamp the length of anything supplied. Note this
                // bounds *characters*, not bytes, and does not make
                // the id ASCII: `chars().take(64)` happily keeps 64
                // three-byte characters. The slicing sites are
                // therefore still required to be char-boundary safe
                // — see `economy_tick::lid_short`.
                l.chars().take(64).collect()
            })
            .or_else(|| {
                // One new person joins the nearest tribe so they have
                // kin to live with; a group founds its own lineage.
                (n == 1)
                    .then(|| self.nearest_living_lineage(x, y, 30.0))
                    .flatten()
            })
            .unwrap_or_else(|| format!("L{}", crate::sim::agents::spawn::seeded_id(&mut self.rng, 6)));
        // A new lineage needs a name, or its people show as
        // "undefined" wherever the tribe name is displayed.
        if !self.lineage_names.contains_key(&lid) {
            let name = crate::organism::organism::generate_tribe_name(&mut self.rng);
            self.lineage_names.insert(lid.clone(), name);
        }
        let before = self.organisms.len();
        let sexes = self.newcomer_sexes(&lid, n);
        // Players can add as many people as they like. Births still
        // respect the natural population limit; this ceiling only
        // keeps a runaway click-fest from freezing the simulation.
        let cap = SANDBOX_PEOPLE_LIMIT;
        for sex in sexes {
            if crate::sim::growth::population_slots_used(&self.organisms) >= cap {
                break;
            }
            let jx = (x + self.rng.random_range(-2.0..2.0)).clamp(2.0, WIDTH as f32 - 2.0);
            let jy = (y + self.rng.random_range(-2.0..2.0)).clamp(2.0, HEIGHT as f32 - 2.0);
            crate::sim::agents::growth::spawn_organism_as(
                &self.grid,
                &mut self.organisms,
                jx,
                jy,
                jx,
                jy,
                lid.clone(),
                sex,
                &mut self.rng,
            );
        }
        self.welcome_newcomers(before, &lid);
        // Report failure when the world is full so the player sees
        // why nobody appeared instead of a silent "applied".
        self.organisms.len() > before
    }

    pub(super) fn cmd_paint(&mut self, x: i32, y: i32, tile: String, radius: i32) -> bool {
        let Some(t) = tile_from_name(&tile) else {
            return false;
        };
        // `x`/`y` arrive straight from JSON, so `x + dx` could
        // overflow `i32` (and panic in debug builds, which run the
        // command handler while holding the sim mutex).
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, 24);
        // Pouring the sea or raising rock over a building wrecks it.
        let wrecks = match t {
            Tile::Water => Some(crate::sim::civ::building_damage::DamageCause::Flood),
            Tile::Rock | Tile::Mineral => Some(crate::sim::civ::building_damage::DamageCause::Buried),
            _ => None,
        };
        if let Some(cause) = wrecks {
            crate::sim::civ::building_damage::strike_buildings(self, x, y, r as f32 + 0.5, 1.0, 1.0, cause);
        }
        for dx in -r..=r {
            for dy in -r..=r {
                if dx * dx + dy * dy > r * r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) && !protected(self.grid.get(nx, ny)) {
                    self.grid.set(nx, ny, t);
                    if matches!(t, Tile::Fire | Tile::Campfire) {
                        *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                        self.physics.register_fire(nx, ny);
                    } else {
                        // Painting over a burning tile must clear its
                        // independent heat layer too, or a hut/resource
                        // can retain a permanent phantom flame.
                        *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                    }
                }
            }
        }
        true
    }

    /// Release animals of one kind on ground they can use. `count` is how many
    /// (a missing count releases one, as before); they are spread over the
    /// `radius` around the point. Their own habitat is preferred when some of
    /// the ground around is theirs, so wolves go to the woods and fish to water.
    pub(super) fn cmd_spawn_animal(
        &mut self,
        x: f32,
        y: f32,
        kind: Option<String>,
        count: u32,
        radius: f32,
    ) -> bool {
        let k = kind.as_deref().map(animal_from_name).unwrap_or(AnimalKind::Deer);
        let alive = self.animals.iter().filter(|a| a.alive).count();
        let room = SANDBOX_ANIMAL_CAP.saturating_sub(alive);
        let n = (count.clamp(1, 12) as usize).min(room);
        if n == 0 {
            return false;
        }
        let cx = x.clamp(2.0, WIDTH as f32 - 2.0);
        let cy = y.clamp(2.0, HEIGHT as f32 - 2.0);
        let spots = self.release_spots(k, cx, cy, radius);
        if spots.is_empty() {
            return false;
        }
        let habitat = k.habitat();
        let at_home: Vec<(i32, i32)> = spots
            .iter()
            .copied()
            .filter(|&(ix, iy)| habitat.contains(&self.grid.biome_at(ix, iy)))
            .collect();
        let pool = if at_home.is_empty() { spots } else { at_home };
        for _ in 0..n {
            let (ix, iy) = pool[self.rng.random_range(0..pool.len())];
            let id = self.next_animal_id;
            self.next_animal_id += 1;
            self.animals.push(Animal::new(id, ix as f32, iy as f32, k));
        }
        true
    }

    /// Tiles around a point where `kind` can be released: first within the
    /// brush radius (at least two tiles), then out to twelve if none fit there.
    fn release_spots(&self, kind: AnimalKind, cx: f32, cy: f32, radius: f32) -> Vec<(i32, i32)> {
        let near = radius.clamp(2.0, 12.0).ceil() as i32;
        let (ox, oy) = (cx as i32, cy as i32);
        for reach in [near, 12] {
            let mut spots = Vec::new();
            for dx in -reach..=reach {
                for dy in -reach..=reach {
                    let (ix, iy) = (ox + dx, oy + dy);
                    if dx * dx + dy * dy <= reach * reach
                        && WorldGrid::in_bounds(ix, iy)
                        && kind.fits_ground(self.grid.get(ix, iy))
                    {
                        spots.push((ix, iy));
                    }
                }
            }
            if !spots.is_empty() {
                return spots;
            }
        }
        Vec::new()
    }

    pub(super) fn cmd_plant(&mut self, x: i32, y: i32, kind: String, radius: i32) -> bool {
        let Some(kind) = crate::sim::tech::plantings::PlantKind::parse(&kind) else {
            return false;
        };
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        self.plant(x, y, kind, radius) > 0
    }

    pub(super) fn cmd_paint_biome(&mut self, x: i32, y: i32, biome: String, radius: i32) -> bool {
        use crate::world::tiles::Biome;
        let kind = match biome.as_str() {
            "grassland" => Biome::Grassland,
            "forest" => Biome::Forest,
            "desert" => Biome::Desert,
            "wetland" => Biome::Wetland,
            "tundra" => Biome::Tundra,
            "jungle" => Biome::Jungle,
            "savanna" => Biome::Savanna,
            "taiga" => Biome::Taiga,
            "badlands" => Biome::Badlands,
            _ => return false,
        };
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = if radius <= 0 { 4 } else { radius.min(24) };
        let mut painted = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                let tile = self.grid.get(nx, ny);
                if matches!(
                    tile,
                    Tile::Water | Tile::Void | Tile::Rock | Tile::Hut | Tile::Fire | Tile::Mineral
                ) {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                self.grid.biome[i] = kind as u8;
                self.grid.fertility[i] = kind.base_fertility();
                // The ground follows the biome: sand for dry lands,
                // snow patches in the cold, grass elsewhere.
                let roll = self.rng.random::<f32>();
                let ground = match kind {
                    Biome::Desert | Biome::Badlands => Tile::Sand,
                    Biome::Tundra if roll < 0.4 => Tile::Snow,
                    Biome::Taiga if roll < 0.15 => Tile::Snow,
                    Biome::Jungle | Biome::Forest if roll < kind.initial_food_chance() => Tile::Food,
                    _ => Tile::Grass,
                };
                if tile != Tile::Food || ground != Tile::Grass {
                    self.grid.set(nx, ny, ground);
                }
                painted += 1;
            }
        }
        painted > 0
    }
}
