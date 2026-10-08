use super::*;

impl Simulation {
    /// A family founds a new tribe: a mother and father who are partners, and
    /// two children of theirs. Children start at about an eighth of a full life.
    pub(super) fn cmd_family(&mut self, x: f32, y: f32) -> bool {
        // Four people need room under the sandbox ceiling, or none are added.
        if crate::sim::growth::population_slots_used(&self.organisms) + 4 > SANDBOX_PEOPLE_LIMIT {
            return false;
        }
        let lid = format!("L{}", crate::sim::agents::spawn::seeded_id(&mut self.rng, 6));
        let name = crate::organism::organism::generate_tribe_name(&mut self.rng);
        self.lineage_names.insert(lid.clone(), name);
        let before = self.organisms.len();
        let place = |sim: &mut Self| {
            let jx = (x + sim.rng.random_range(-2.0..2.0)).clamp(2.0, WIDTH as f32 - 2.0);
            let jy = (y + sim.rng.random_range(-2.0..2.0)).clamp(2.0, HEIGHT as f32 - 2.0);
            (jx, jy)
        };
        use crate::organism::organism::Sex;
        for sex in [Sex::Female, Sex::Male] {
            let (jx, jy) = place(self);
            crate::sim::agents::growth::spawn_organism_as(
                &self.grid,
                &mut self.organisms,
                jx,
                jy,
                jx,
                jy,
                lid.clone(),
                Some(sex),
                &mut self.rng,
            );
        }
        let mother = self.organisms[before].id.clone();
        let father = self.organisms[before + 1].id.clone();
        self.organisms[before].partner_id = Some(father.clone());
        self.organisms[before + 1].partner_id = Some(mother.clone());
        // The parents are welcomed as adults first; the children keep their own ages below.
        self.welcome_newcomers(before, &lid);
        for sex in [Sex::Male, Sex::Female] {
            let (jx, jy) = place(self);
            crate::sim::agents::growth::spawn_organism_as(
                &self.grid,
                &mut self.organisms,
                jx,
                jy,
                jx,
                jy,
                lid.clone(),
                Some(sex),
                &mut self.rng,
            );
            let child = self.organisms.last_mut().expect("a child was just spawned");
            child.age = (child.max_age as f32 * 0.12) as u32;
            child.parent_id = mother.clone();
            child.father_id = Some(father.clone());
        }
        self.organisms.len() > before
    }

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

    pub(super) fn cmd_spawn_animal(&mut self, x: f32, y: f32, kind: Option<String>) -> bool {
        if self.animals.iter().filter(|a| a.alive).count() >= SANDBOX_ANIMAL_CAP {
            return false;
        }
        let k = kind.as_deref().map(animal_from_name).unwrap_or(AnimalKind::Deer);
        let cx = x.clamp(2.0, WIDTH as f32 - 2.0);
        let cy = y.clamp(2.0, HEIGHT as f32 - 2.0);
        let id = self.next_animal_id;
        self.next_animal_id += 1;
        self.animals.push(Animal::new(id, cx, cy, k));
        true
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

#[cfg(test)]
mod family_tests {
    use crate::organism::organism::Sex;
    use crate::sim::simulation::Simulation;

    #[test]
    fn family_founds_a_partnered_couple_with_two_children() {
        let mut sim = Simulation::new(5);
        let before = sim.organisms.len();
        assert!(sim.apply_command_json(r#"{"cmd":"family","x":100.0,"y":100.0}"#));
        let family = &sim.organisms[before..];
        assert_eq!(family.len(), 4);
        let lineage = family[0].lineage_id.clone();
        assert!(family.iter().all(|o| o.lineage_id == lineage), "one new tribe");
        assert!(sim.lineage_names.contains_key(&lineage), "the tribe has a name");

        let (mother, father) = (&family[0], &family[1]);
        assert_eq!(mother.sex, Sex::Female);
        assert_eq!(father.sex, Sex::Male);
        assert_eq!(mother.partner_id.as_deref(), Some(father.id.as_str()));
        assert_eq!(father.partner_id.as_deref(), Some(mother.id.as_str()));

        for child in &family[2..] {
            assert_eq!(child.parent_id, mother.id);
            assert_eq!(child.father_id.as_deref(), Some(father.id.as_str()));
            assert!(
                child.age < child.max_age / 4,
                "children start in childhood or younger"
            );
        }
    }
}
