use super::Simulation;
use crate::math::DetMath;
use crate::sim::world_events::push_event;
use crate::world::grid::{WorldGrid, WIDTH};
use crate::world::tiles::Tile;
use rand::RngExt;

/// How far a blessing reaches, in tiles, unless the radius says otherwise.
const DEFAULT_REACH: f32 = 6.0;
const MAX_REACH: f32 = 16.0;
/// Growth a planting gets from a forest's surge, in ticks.
const SURGE_GROWTH: u16 = 40;
/// Chance a grass tile among the trees sprouts wild food in a forest's surge.
const SURGE_FOOD_CHANCE: f32 = 0.30;
/// The gifts a rare talent can bring. Each lifts one of a person's traits.
const TALENTS: [&str; 4] = [
    "gifted-memory",
    "gifted-curiosity",
    "gifted-resilience",
    "gifted-kindness",
];

fn reach_of(radius: f32) -> f32 {
    if radius > 0.0 {
        radius.min(MAX_REACH)
    } else {
        DEFAULT_REACH
    }
}

impl Simulation {
    /// The river blesses the land: fish gather in the water nearest the point. False when there is no water
    /// within reach.
    pub(super) fn cmd_bless_river(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = reach_of(radius);
        let r = reach.ceil() as i32;
        let (cx, cy) = (x as i32, y as i32);
        let water_in_reach = (-r..=r).any(|dx| {
            (-r..=r).any(|dy| {
                (dx * dx + dy * dy) as f32 <= reach * reach && self.grid.get(cx + dx, cy + dy) == Tile::Water
            })
        });
        if !water_in_reach {
            return false;
        }
        let count = 6 + reach as u32 / 2;
        if !self.cmd_spawn_animal(x, y, Some("fish".to_string()), count, reach) {
            return false;
        }
        push_event(
            &mut self.events,
            self.tick_count,
            "life",
            "the river",
            &format!("the river blesses the land: fish gather in the water near ({x:.0}, {y:.0})"),
        );
        true
    }

    /// A forest surges: wild food sprouts on the open ground among the trees, and the plantings in reach grow on.
    /// False when no wooded ground is in reach.
    pub(super) fn cmd_bless_forest(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = reach_of(radius);
        let r = reach.ceil() as i32;
        let (cx, cy) = (x as i32, y as i32);
        let mut sprouted = 0usize;
        let mut wooded = 0usize;
        for dx in -r..=r {
            for dy in -r..=r {
                if (dx * dx + dy * dy) as f32 > reach * reach {
                    continue;
                }
                let (ix, iy) = (cx + dx, cy + dy);
                if !WorldGrid::in_bounds(ix, iy) || !self.grid.biome_at(ix, iy).wooded() {
                    continue;
                }
                wooded += 1;
                if self.grid.get(ix, iy) == Tile::Grass && self.rng.random::<f32>() < SURGE_FOOD_CHANCE {
                    self.grid.set(ix, iy, Tile::Food);
                    sprouted += 1;
                }
            }
        }
        if wooded == 0 {
            return false;
        }
        let mut grown = 0usize;
        for (&idx, planting) in self.plantings.iter_mut() {
            let (px, py) = ((idx as usize % WIDTH) as f32, (idx as usize / WIDTH) as f32);
            if (px - x).det_hypot(py - y) <= reach {
                planting.growth = planting.growth.saturating_add(SURGE_GROWTH);
                grown += 1;
            }
        }
        push_event(
            &mut self.events,
            self.tick_count,
            "life",
            "the forest",
            &format!("the forest surges near ({x:.0}, {y:.0}): {sprouted} new patches of food, {grown} plantings grow on"),
        );
        true
    }

    /// A rare gift for the living person nearest the point (within the radius): one of the talents, which lifts
    /// one of their traits for good. A person keeps one talent; False when nobody in reach lacks one.
    pub(super) fn cmd_talent(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = reach_of(radius);
        let nearest = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && !TALENTS.iter().any(|t| o.attributes.contains(*t)))
            .map(|(i, o)| (i, (o.x - x).det_hypot(o.y - y)))
            .filter(|&(_, d)| d <= reach)
            .min_by(|a, b| a.1.total_cmp(&b.1));
        let Some((i, _)) = nearest else {
            return false;
        };
        let pick = self.rng.random_range(0..TALENTS.len());
        let tick = self.tick_count;
        let person = &mut self.organisms[i];
        let lift = |v: f32| (v + 0.25).min(1.0);
        match pick {
            0 => person.traits.memory_strength = lift(person.traits.memory_strength),
            1 => person.traits.curiosity = lift(person.traits.curiosity),
            2 => person.traits.resilience = lift(person.traits.resilience),
            _ => person.traits.social_tendency = lift(person.traits.social_tendency),
        }
        let talent = TALENTS[pick];
        person.attributes.insert(talent.to_string());
        person.joy_ticks = (person.joy_ticks + 300).min(1200);
        person.think(&format!("a rare gift came to them: {talent}"), tick);
        person.log_event(format!("was blessed with a rare gift ({talent})"));
        let name = person.name.clone();
        push_event(
            &mut self.events,
            tick,
            "life",
            &name,
            &format!("was blessed with a rare gift ({talent})"),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::world::grid::{HEIGHT, WIDTH};
    use crate::world::tiles::{Biome, Tile};

    fn grass_world(sim: &mut Simulation) {
        for x in 0..WIDTH as i32 {
            for y in 0..HEIGHT as i32 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
    }

    #[test]
    fn a_blessed_river_fills_with_fish_and_a_dry_point_with_none() {
        let mut sim = Simulation::new(71);
        grass_world(&mut sim);
        for x in 100..110 {
            for y in 100..110 {
                sim.grid.set(x, y, Tile::Water);
            }
        }
        sim.animals.clear();
        assert!(sim.apply_command_json(r#"{"cmd":"bless_river","x":105.0,"y":105.0,"radius":6.0}"#));
        assert!(sim.animals.len() >= 6, "fish gather in the river");
        assert!(sim
            .animals
            .iter()
            .all(|a| matches!(a.kind, crate::organism::animal::AnimalKind::Fish)));
        sim.animals.clear();
        assert!(!sim.apply_command_json(r#"{"cmd":"bless_river","x":30.0,"y":30.0,"radius":4.0}"#));
        assert!(sim.animals.is_empty(), "no water in reach, no fish");
    }

    #[test]
    fn a_forest_surge_sprouts_food_among_the_trees_and_grows_the_plantings() {
        let mut sim = Simulation::new(72);
        grass_world(&mut sim);
        for x in 50..70 {
            for y in 50..70 {
                sim.grid.biome[crate::world::grid::WorldGrid::idx(x, y)] = Biome::Forest as u8;
            }
        }
        assert!(sim.apply_command_json(r#"{"cmd":"bless_forest","x":60.0,"y":60.0,"radius":8.0}"#));
        let food = (50..70)
            .flat_map(|x| (50..70).map(move |y| (x, y)))
            .filter(|&(x, y)| sim.grid.get(x, y) == Tile::Food)
            .count();
        assert!(food > 0, "food sprouts among the trees");
        let mut far = Simulation::new(72);
        grass_world(&mut far);
        assert!(!far.apply_command_json(r#"{"cmd":"bless_forest","x":60.0,"y":60.0,"radius":8.0}"#));
    }

    #[test]
    fn a_rare_talent_goes_to_the_nearest_person_once() {
        let mut sim = Simulation::new(73);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = 80.0;
        sim.organisms[0].y = 80.0;
        let t = sim.organisms[0].traits.clone();
        let before = t.memory_strength + t.curiosity + t.resilience + t.social_tendency;
        assert!(sim.apply_command_json(r#"{"cmd":"talent","x":81.0,"y":80.0,"radius":4.0}"#));
        let person = &sim.organisms[0];
        assert!(
            person.attributes.iter().any(|a| a.starts_with("gifted-")),
            "the person has a talent"
        );
        let t = &person.traits;
        let after = t.memory_strength + t.curiosity + t.resilience + t.social_tendency;
        assert!(after > before, "the talent lifts one of their traits");
        assert!(
            !sim.apply_command_json(r#"{"cmd":"talent","x":81.0,"y":80.0,"radius":4.0}"#),
            "a person keeps one talent"
        );
    }
}
